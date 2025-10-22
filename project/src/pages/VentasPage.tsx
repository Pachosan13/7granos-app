// src/pages/VentasPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, DollarSign, Receipt, Building2, Calendar, X } from 'lucide-react';
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
import { formatCurrencyUSD, formatDateDDMMYYYY } from '../lib/format';
import { KPICard } from '../components/KPICard';
import { RealtimeStatusIndicator } from '../components/RealtimeStatusIndicator';
import { useRealtimeVentas } from '../hooks/useRealtimeVentas';
import { debugLog, getFunctionsBase } from '../utils/diagnostics';

type SucursalRow = {
  nombre: string;
  ventas: number;
  transacciones: number;
  ticketPromedio: number;
};

type SyncBranchStat = { name: string; orders: number; sales?: number };

// nombre visible → código corto usado por las vistas
const nameToCode = (nombre?: string) => {
  const n = (nombre ?? '').toLowerCase();
  if (n.includes('san francisco')) return 'sf';
  if (n.includes('museo')) return 'museo';
  if (n.includes('cangrejo')) return 'cangrejo';
  if (n.includes('costa')) return 'costa';
  if (n.includes('central')) return 'central';
  return 'sf';
};

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
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function VentasPage() {
  const { sucursales, sucursalSeleccionada, getFilteredSucursalIds } = useAuthOrg();

  const functionsBase = useMemo(() => getFunctionsBase(), []);

  // Mapa id → code para traducir selección a códigos de sucursal
  const idToCode = useMemo(
    () => new Map<string, string>(sucursales.map(s => [String(s.id), nameToCode(s.nombre)])),
    [sucursales]
  );

  // --------- Filtros ---------
  const hoy = useMemo(() => todayYMD(), []);
  const [desde, setDesde] = useState(addDays(hoy, -7));
  const [hasta, setHasta] = useState(hoy);

  // Selección local (id como string)
  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(
    sucursalSeleccionada?.id ? String(sucursalSeleccionada.id) : null
  );

  // --------- Estado de página ---------
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [totalVentas, setTotalVentas] = useState(0);
  const [totalTransacciones, setTotalTransacciones] = useState(0);
  const [totalITBMS, setTotalITBMS] = useState(0);

  const [rows, setRows] = useState<SucursalRow[]>([]);
  const [seriesData, setSeriesData] = useState<any[]>([]);

  // Banner
  const [syncBanner, setSyncBanner] = useState<{
    when: string;
    stats: SyncBranchStat[];
    visible: boolean;
    kind?: 'ok' | 'warn';
    message?: string;
  } | null>(null);

  // Debug
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  // Helpers UI
  const viewingAll = selectedSucursalId === null;

  const selectedSucursalName = viewingAll
    ? null
    : (sucursales.find(s => String(s.id) === selectedSucursalId)?.nombre ?? 'Sucursal');

  const headerNote = viewingAll
    ? `Viendo datos de todas las sucursales (${sucursales.length} sucursales)`
    : `Viendo únicamente: ${selectedSucursalName}`;

  // --------- Carga desde DB ---------
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // IDs → códigos de sucursal
      const codes = viewingAll
        ? getFilteredSucursalIds()
            .map(String)
            .map(id => idToCode.get(id))
            .filter((x): x is string => !!x)
        : selectedSucursalId
        ? [idToCode.get(String(selectedSucursalId))!].filter(Boolean)
        : [];

      // v_ui_series_14d se filtra por 'sucursal' (código texto) + rango de fechas
      let seriesQuery = supabase
        .from('v_ui_series_14d')
        .select('*')
        .gte('dia', desde)
        .lte('dia', hasta)
        .order('dia', { ascending: true });

      if (!viewingAll && codes.length === 1) {
        seriesQuery = seriesQuery.eq('sucursal', codes[0]);
      } else if (viewingAll && codes.length > 0) {
        seriesQuery = seriesQuery.in('sucursal', codes);
      }

      const { data: rawSeries, error: seriesError } = await seriesQuery;
      if (seriesError) throw seriesError;

      const normalizedSeries = (rawSeries ?? []).map((row: Record<string, any>) => {
        const sucCode = row.sucursal ?? null;
        const nombre =
          row.sucursal_nombre ??
          row.nombre ??
          (sucCode ? `Sucursal ${String(sucCode).toUpperCase()}` : 'Sin sucursal');
        const ventas = Number(row.ventas_brutas ?? row.total_bruto ?? 0);
        const margen = Number(row.margen ?? row.margen_bruto ?? 0);
        const tickets = Number(row.tickets ?? row.transacciones ?? 0);
        const lineas = Number(row.lineas ?? row.line_items ?? 0);
        const cogs = Number(row.cogs ?? row.costo ?? 0);
        const itbms = Number(row.itbms ?? row.total_impuestos ?? row.impuesto ?? 0);

        return {
          dia: row.dia,
          fecha: formatDateDDMMYYYY(row.dia),
          ventas,
          margen,
          tickets,
          lineas,
          cogs,
          itbms,
          sucursal: sucCode,
          sucursal_nombre: nombre,
        };
      });

      const seriesByDayMap = new Map<
        string,
        { dia: string; fecha: string; ventas: number; margen: number; tickets: number }
      >();
      normalizedSeries.forEach(row => {
        const entry =
          seriesByDayMap.get(row.dia) ?? { dia: row.dia, fecha: row.fecha, ventas: 0, margen: 0, tickets: 0 };
        entry.ventas += row.ventas;
        entry.margen += row.margen;
        entry.tickets += row.tickets;
        seriesByDayMap.set(row.dia, entry);
      });

      const safe = (v?: string) => v ?? '';
      const seriesForChart = Array.from(seriesByDayMap.values()).sort((a, b) =>
        safe(a.dia).localeCompare(safe(b.dia))
      );
      setSeriesData(seriesForChart);

      const sucursalMap = new Map<
        string,
        { nombre: string; ventas: number; transacciones: number }
      >();
      normalizedSeries.forEach(row => {
        const key = row.sucursal ?? row.sucursal_nombre ?? 'sin-code';
        const entry = sucursalMap.get(key) ?? { nombre: row.sucursal_nombre, ventas: 0, transacciones: 0 };
        entry.ventas += row.ventas;
        entry.transacciones += row.tickets;
        sucursalMap.set(key, entry);
      });

      const rowsList: SucursalRow[] = Array.from(sucursalMap.values())
        .map(entry => ({
          nombre: entry.nombre,
          ventas: entry.ventas,
          transacciones: entry.transacciones,
          ticketPromedio: entry.transacciones > 0 ? entry.ventas / entry.transacciones : 0,
        }))
        .sort((a, b) => b.ventas - a.ventas);

      setRows(rowsList);

      // Totales desde la serie
      const totalsFromSeries = normalizedSeries.reduce(
        (acc, row) => ({
          ventas: acc.ventas + row.ventas,
          tickets: acc.tickets + row.tickets,
          itbms: acc.itbms + row.itbms,
        }),
        { ventas: 0, tickets: 0, itbms: 0 }
      );

      let totals = totalsFromSeries;

      // Si el rango incluye hoy, intentamos v_ui_kpis_hoy (también por 'sucursal')
      const incluyeHoy = desde <= hoy && hasta >= hoy;
      if (incluyeHoy) {
        let kpisQuery = supabase.from('v_ui_kpis_hoy').select('*');
        if (!viewingAll && codes.length === 1) {
          kpisQuery = kpisQuery.eq('sucursal', codes[0]);
        } else if (viewingAll && codes.length > 0) {
          kpisQuery = kpisQuery.in('sucursal', codes);
        }
        const { data: kpisHoy, error: kpisError } = await kpisQuery;
        if (!kpisError && Array.isArray(kpisHoy) && kpisHoy.length > 0) {
          totals = (kpisHoy as any[]).reduce(
            (acc, row) => ({
              ventas: acc.ventas + Number(row.ventas_brutas ?? row.total_bruto ?? 0),
              tickets: acc.tickets + Number(row.tickets ?? row.transacciones ?? 0),
              itbms: acc.itbms + Number(row.itbms ?? row.total_impuestos ?? 0),
            }),
            { ventas: 0, tickets: 0, itbms: 0 }
          );
        }
      }

      setTotalVentas(totals.ventas);
      setTotalTransacciones(totals.tickets);
      setTotalITBMS(totals.itbms);

      setDebugInfo({
        filtro: { desde, hasta, viewingAll, selectedSucursalId, selectedSucursalName, codes },
        seriesCount: normalizedSeries.length,
        seriesSample: normalizedSeries[0] ?? null,
        totals,
      });

      setSyncBanner(prev => (prev && prev.kind === 'warn' ? null : prev));
    } catch (e) {
      debugLog('[VentasPage] loadData error:', e);
      setRows([]);
      setSeriesData([]);
      setTotalVentas(0);
      setTotalTransacciones(0);
      setTotalITBMS(0);
      setDebugInfo({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [
    desde,
    hasta,
    viewingAll,
    selectedSucursalId,
    selectedSucursalName,
    getFilteredSucursalIds,
    hoy,
    idToCode,
  ]);

  // --------- Sync: Edge function PERSISTE y recarga DB ---------
  const handleSync = useCallback(async () => {
    if (!functionsBase) {
      setSyncBanner({
        when: new Date().toISOString(),
        stats: [],
        visible: true,
        kind: 'warn',
        message: 'Edge Function no configurada (revisa VITE_SUPABASE_FUNCTIONS_BASE).',
      });
      return;
    }

    setSyncing(true);
    try {
      const hoySync = hoy;
      const query = `?desde=${hoySync}&hasta=${hoySync}`;
      const endpoints = [
        `${functionsBase}/sync-ventas-detalle${query}`,
        `${functionsBase}/sync-ventas-v4${query}`,
        `${functionsBase}/sync-ventas${query}`,
      ];

      const invokeEndpoint = async (endpoint: string) => {
        debugLog('[VentasPage] sync request', endpoint);
        const run = async (retry: boolean): Promise<Response> => {
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
          });

          if (!resp.ok && resp.status >= 500 && retry) {
            debugLog('[VentasPage] sync retry por status', resp.status);
            return run(false);
          }

          return resp;
        };

        return run(true);
      };

      let resp: Response | null = null;

      for (const endpoint of endpoints) {
        try {
          const response = await invokeEndpoint(endpoint);
          if (!response.ok && response.status === 404) {
            if (endpoint.includes('sync-ventas-detalle')) {
              debugLog('[VentasPage] sync-ventas-detalle no disponible, intentando compatibilidad');
              continue;
            }
            if (endpoint.includes('sync-ventas-v4')) {
              debugLog('[VentasPage] sync-ventas-v4 no disponible, probando sync-ventas');
              continue;
            }
          }
          resp = response;
          break;
        } catch (err) {
          throw err;
        }
      }

      if (!resp) {
        throw new Error('No fue posible ejecutar la sincronización');
      }
      let bannerStats: SyncBranchStat[] = [];
      let when = new Date().toISOString();

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        let friendly = `HTTP ${resp.status}`;
        if (resp.status === 401 || resp.status === 403) friendly = 'Sesión caducada o permisos insuficientes.';
        else if (resp.status === 404) friendly = 'Recurso de sincronización no encontrado.';
        else if (resp.status >= 500) friendly = 'Servicio remoto con errores, reintenta en unos minutos.';
        throw new Error(`${friendly}${txt ? ` · ${txt.slice(0, 120)}` : ''}`);
      }

      try {
        const js = await resp.json();
        debugLog('[VentasPage] sync response', js);
        if (js?.desde) when = js.desde;
        if (Array.isArray(js?.branches)) {
          bannerStats = js.branches.map((b: any) => ({
            name: String(b.name ?? b.branch ?? 'Sucursal'),
            orders: Number(b.orders ?? b.count ?? 0),
            sales: typeof b.sales === 'number' ? b.sales : undefined,
          }));
        }
      } catch (e) {
        debugLog('[VentasPage] fallo parseando respuesta de sync', e);
      }

      if (bannerStats.length > 0) {
        setSyncBanner({ when, stats: bannerStats, visible: true, kind: 'ok' });
        setTimeout(() => setSyncBanner((s) => (s ? { ...s, visible: false } : s)), 12000);
      } else {
        setSyncBanner({ when, stats: [], visible: true, kind: 'ok', message: 'Sincronización completada.' });
        setTimeout(() => setSyncBanner((s) => (s ? { ...s, visible: false } : s)), 6000);
      }

      await loadData();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error desconocido en sincronización';
      setSyncBanner({
        when: new Date().toISOString(),
        stats: [],
        visible: true,
        kind: 'warn',
        message,
      });
      debugLog('Sync Ventas (DB) error:', e);
    } finally {
      setSyncing(false);
    }
  }, [functionsBase, hoy, loadData]);

  // --------- Realtime ---------
  const rt: any = useRealtimeVentas({
    enabled: true,
    debounceMs: 1500,
    onUpdate: () => {
      debugLog('[VentasPage] actualización en tiempo real detectada');
      loadData();
    },
  });

  let rtConnected = false as boolean;
  let rtError: string | null = null;
  let rtLastUpdate: string | Date | null = null;
  let onReconnect: () => void = () => window.location.reload();

  if (typeof rt === 'string') {
    rtConnected = rt === 'open';
    rtError = rt === 'error' ? 'Connection error' : null;
  } else if (rt && typeof rt === 'object') {
    // @ts-ignore
    if (typeof rt.connected === 'boolean') rtConnected = !!rt.connected;
    // @ts-ignore
    if (typeof rt.error === 'string') rtError = rt.error || null;
    // @ts-ignore
    if (rt.lastUpdate) rtLastUpdate = rt.lastUpdate as any;
    // @ts-ignore
    if (!('connected' in rt) && typeof rt.status === 'string') {
      // @ts-ignore
      rtConnected = rt.status === 'open';
      // @ts-ignore
      if (rt.status === 'error' && !rtError) rtError = 'Connection error';
    }
    // @ts-ignore
    if (typeof rt.manualReconnect === 'function') {
      // @ts-ignore
      onReconnect = rt.manualReconnect;
    }
  }

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handler = () => {
      debugLog('[VentasPage] evento debug:refetch-all recibido');
      loadData();
    };
    window.addEventListener('debug:refetch-all', handler);
    return () => window.removeEventListener('debug:refetch-all', handler);
  }, [loadData]);

  // Sincronizar selector local cuando cambia el contexto
  useEffect(() => {
    if (sucursalSeleccionada?.id) {
      setSelectedSucursalId(String(sucursalSeleccionada.id));
    } else {
      setSelectedSucursalId(null);
    }
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
                <RealtimeStatusIndicator
                  connected={rtConnected}
                  lastUpdate={rtLastUpdate}
                  error={rtError}
                  onReconnect={onReconnect}
                  compact
                />
              </div>
              <p className="text-gray-600 dark:text-gray-400">Resumen y análisis de ventas por sucursal</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{headerNote}</p>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          </div>

          {/* Banner de Sync / Avisos */}
          {syncBanner?.visible && (
            <div className={`mt-4 border rounded-xl p-4 ${bannerClass}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">
                    {syncBanner.kind === 'warn'
                      ? 'Faltan ITBMS en algunas ventas'
                      : `INVU OK (${syncBanner.when})`}
                  </div>
                  <div className="text-sm mt-1">
                    {syncBanner.message ? (
                      <span>{syncBanner.message}</span>
                    ) : syncBanner.kind === 'warn' ? (
                      `Se detectaron ${syncBanner.stats?.[0]?.orders ?? 0} registros sin ITBMS. El total de ITBMS solo suma valores provenientes del INVU.`
                    ) : (
                      syncBanner.stats.map((s) => (
                        <span key={s.name} className="mr-3">
                          <b>{s.name}</b>: {s.orders} órdenes{typeof s.sales === 'number' ? ` · ${formatCurrencyUSD(s.sales)}` : ''}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSyncBanner((b) => (b ? { ...b, visible: false } : b))}
                  className="hover:opacity-70"
                  aria-label="Cerrar banner"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Filtros
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
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
                    <option key={String(s.id)} value={String(s.id)}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
                <div className="inline-flex items-center px-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                  <Building2 className="h-4 w-4 mr-2" />
                  {viewingAll ? 'Todas' : 'Individual'}
                </div>
              </div>
            </div>
          </div>

          {/* Debug toggler */}
          <div className="mt-3">
            <button
              className="text-xs underline text-gray-500 dark:text-gray-400"
              onClick={() => setShowDebug((s) => !s)}
            >
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
          <KPICard
            title="Total Ventas"
            value={totalVentas}
            icon={DollarSign}
            color="bg-gradient-to-br from-green-500 to-emerald-600"
            prefix="USD "
            trend={12}
          />
          <KPICard
            title="Total ITBMS"
            value={totalITBMS}
            icon={TrendingUp}
            color="bg-gradient-to-br from-indigo-500 to-purple-600"
            prefix="USD "
            trend={5}
          />
          <KPICard
            title="# Transacciones"
            value={totalTransacciones}
            icon={Receipt}
            color="bg-gradient-to-br from-blue-500 to-cyan-600"
            trend={8}
          />
        </div>

        {/* Serie 14 días */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Serie de ventas (14 días)</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Fuente: vista v_ui_series_14d</p>
            </div>
          </div>
          <div className="h-80 px-6 pb-6">
            {seriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                {loading ? 'Cargando…' : 'Sin datos en el rango seleccionado.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={seriesData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="fecha" stroke="#6b7280" fontSize={12} minTickGap={16} />
                  <YAxis
                    yAxisId="left"
                    stroke="#6b7280"
                    fontSize={12}
                    tickFormatter={(v: number) => formatCurrencyUSD(v)}
                    width={90}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#6b7280"
                    fontSize={12}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value: number, name) =>
                      name === 'Ventas' ? formatCurrencyUSD(value) : value.toLocaleString()
                    }
                    labelFormatter={(label) => `Día: ${label}`}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="ventas"
                    name="Ventas"
                    fill="#3b82f6"
                    stroke="#2563eb"
                    strokeWidth={2}
                    activeDot={{ r: 5 }}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="tickets"
                    name="Tickets"
                    fill="#10b981"
                    opacity={0.75}
                    barSize={24}
                  />
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
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">
              No hay datos de ventas en el período seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Sucursal
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Ventas
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Transacciones
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Ticket Promedio
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map((r) => (
                    <tr key={r.nombre} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4">{r.nombre}</td>
                      <td className="px-6 py-4 text-right font-semibold">
                        {formatCurrencyUSD(r.ventas)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {r.transacciones.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {formatCurrencyUSD(r.ticketPromedio)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

