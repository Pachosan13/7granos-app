import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, DollarSign, Receipt, Building2, Calendar } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Area,
  Bar,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuthOrg } from '../context/AuthOrgContext';
import { KPICard } from '../components/KPICard';
import { RealtimeStatusIndicator } from '../components/RealtimeStatusIndicator';
import { useRealtimeVentas } from '../hooks/useRealtimeVentas';
import { debugLog, getFunctionsBase } from '../utils/diagnostics';
import { formatCurrencyUSD, formatDateDDMMYYYY } from '../lib/format';

type RpcSerieRow = {
  d: string;
  ventas_netas: number;
  itbms: number;
  tx: number;
};

type ViewSeriesRow = {
  dia: string;
  sucursal: string;
  ventas_brutas: number;
  tickets: number;
};

type SerieChartRow = {
  dia: string;
  fecha: string;
  ventas: number;
  tickets: number;
};

type TablaSucursal = {
  nombre: string;
  ventas: number;
  transacciones: number;
  ticketPromedio: number;
};

type SyncBranchStat = { name: string; orders: number; sales?: number };

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

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export default function VentasPage() {
  const { sucursales, sucursalSeleccionada } = useAuthOrg();
  const functionsBase = useMemo(() => getFunctionsBase(), []);

  const hoy = useMemo(() => todayYMD(), []);
  const [desde, setDesde] = useState(addDays(hoy, -7));
  const [hasta, setHasta] = useState(hoy);

  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(
    sucursalSeleccionada?.id ? String(sucursalSeleccionada.id) : null
  );

  const viewingAll = selectedSucursalId === null;
  const selectedSucursalName = viewingAll
    ? null
    : sucursales.find((s) => String(s.id) === selectedSucursalId)?.nombre ?? null;

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [totalVentas, setTotalVentas] = useState(0);
  const [totalTransacciones, setTotalTransacciones] = useState(0);
  const [totalITBMS, setTotalITBMS] = useState(0);
  const [rows, setRows] = useState<TablaSucursal[]>([]);
  const [seriesData, setSeriesData] = useState<SerieChartRow[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [syncBanner, setSyncBanner] = useState<{
    when: string;
    stats: SyncBranchStat[];
    visible: boolean;
    kind?: 'ok' | 'warn';
    message?: string;
  } | null>(null);

  const headerNote = viewingAll
    ? `Viendo datos de todas las sucursales (${sucursales.length} sucursales)`
    : `Viendo únicamente: ${selectedSucursalName ?? 'Sucursal'}`;

  /*
   * Ventas usa rpc_ui_series_14d como única fuente para KPIs y serie diaria.
   * Cuando se envía p_sucursal_id no re-filtramos la respuesta; sólo sumamos
   * por día y dejamos el ranking global a la vista v_ui_series_14d.
   */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: serie, error: rpcError } = await supabase.rpc<RpcSerieRow[]>(
        'rpc_ui_series_14d',
        {
          p_desde: desde,
          p_hasta: hasta,
          p_sucursal_id: viewingAll ? null : selectedSucursalId,
        }
      );
      if (rpcError) throw rpcError;

      const serieRows = Array.isArray(serie) ? serie : [];
      const agrupada = new Map<string, SerieChartRow>();
      for (const row of serieRows) {
        const rawDia = row.d ?? (row as any).dia ?? (row as any).fecha;
        if (!rawDia) continue;
        const dia = String(rawDia);
        if (!agrupada.has(dia)) {
          agrupada.set(dia, {
            dia,
            fecha: formatDateDDMMYYYY(dia),
            ventas: 0,
            tickets: 0,
          });
        }
        const actual = agrupada.get(dia)!;
        actual.ventas += toNumber(row.ventas_netas ?? (row as any).ventas_brutas ?? (row as any).ventas);
        actual.tickets += toNumber(row.tx ?? (row as any).tickets ?? (row as any).transacciones);
      }

      const serieFmt = Array.from(agrupada.values()).sort((a, b) => a.dia.localeCompare(b.dia));

      setSeriesData(serieFmt);

      const sumVentas = serieRows.reduce(
        (acc, row) => acc + toNumber(row.ventas_netas ?? (row as any).ventas_brutas ?? (row as any).ventas),
        0
      );
      const sumTickets = serieRows.reduce(
        (acc, row) => acc + toNumber(row.tx ?? (row as any).tickets ?? (row as any).transacciones),
        0
      );
      const sumITBMS = serieRows.reduce((acc, row) => acc + toNumber(row.itbms ?? (row as any).total_itbms), 0);
      setTotalVentas(sumVentas);
      setTotalTransacciones(sumTickets);
      setTotalITBMS(sumITBMS);

      if (viewingAll) {
        const { data: viewRows, error: viewError } = await supabase
          .from<ViewSeriesRow>('v_ui_series_14d')
          .select('sucursal,ventas_brutas,tickets,dia')
          .gte('dia', desde)
          .lte('dia', hasta);
        if (viewError) throw viewError;

        const aggregated = new Map<string, { nombre: string; ventas: number; transacciones: number }>();
        (viewRows ?? []).forEach((row) => {
          const key = row.sucursal ?? 'Sin sucursal';
          const current = aggregated.get(key) ?? { nombre: key, ventas: 0, transacciones: 0 };
          current.ventas += toNumber(row.ventas_brutas);
          current.transacciones += toNumber(row.tickets);
          aggregated.set(key, current);
        });

        const ranked = Array.from(aggregated.values())
          .map((entry) => ({
            ...entry,
            ticketPromedio: entry.transacciones > 0 ? entry.ventas / entry.transacciones : 0,
          }))
          .sort((a, b) => b.ventas - a.ventas);

        setRows(ranked);
      } else {
        const ventasTotal = serieFmt.reduce((acc, row) => acc + row.ventas, 0);
        const txTotal = serieFmt.reduce((acc, row) => acc + row.tickets, 0);
        setRows([
          {
            nombre: selectedSucursalName ?? 'Sucursal',
            ventas: ventasTotal,
            transacciones: txTotal,
            ticketPromedio: txTotal > 0 ? ventasTotal / txTotal : 0,
          },
        ]);
      }

      setDebugInfo({
        modo: viewingAll ? 'todas' : 'individual',
        filtro: { desde, hasta, selectedSucursalId, selectedSucursalName },
        serieCount: serieRows.length,
        seriePreview: serieFmt.slice(0, 3),
      });
    } catch (error) {
      debugLog('[VentasPage] loadData error:', error);
      setRows([]);
      setSeriesData([]);
      setTotalVentas(0);
      setTotalTransacciones(0);
      setTotalITBMS(0);
      setDebugInfo({ error: String(error) });
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, viewingAll, selectedSucursalId, selectedSucursalName]);

  const handleSync = useCallback(async () => {
    const base = functionsBase;
    if (!base) {
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
      const today = hoy;
      const query = `?desde=${today}&hasta=${today}`;
      const endpoints = [
        `${base}/sync-ventas-detalle${query}`,
        `${base}/sync-ventas-v4${query}`,
        `${base}/sync-ventas${query}`,
      ];

      const invoke = async (url: string) => {
        const run = async (retry: boolean): Promise<Response> => {
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          if (!resp.ok && resp.status >= 500 && retry) return run(false);
          return resp;
        };
        return run(true);
      };

      let response: Response | null = null;
      for (const endpoint of endpoints) {
        try {
          const attempt = await invoke(endpoint);
          if (!attempt.ok && attempt.status === 404) continue;
          response = attempt;
          break;
        } catch (error) {
          debugLog('[VentasPage] sync endpoint error', error);
        }
      }

      if (!response) throw new Error('No fue posible ejecutar la sincronización');

      let when = new Date().toISOString();
      try {
        const body = await response.json();
        if (body?.desde) when = body.desde;
      } catch (error) {
        debugLog('[VentasPage] sync response parse error', error);
      }

      setSyncBanner({ when, stats: [], visible: true, kind: 'ok', message: 'Sincronización completada.' });
      setTimeout(() => setSyncBanner((state) => (state ? { ...state, visible: false } : state)), 6000);
      await loadData();
    } catch (error: any) {
      setSyncBanner({
        when: new Date().toISOString(),
        stats: [],
        visible: true,
        kind: 'warn',
        message: error?.message ?? 'Error desconocido en sincronización',
      });
      debugLog('Sync Ventas (DB) error:', error);
    } finally {
      setSyncing(false);
    }
  }, [functionsBase, hoy, loadData]);

  const realtimeState: any = useRealtimeVentas({
    enabled: true,
    debounceMs: 1500,
    onUpdate: () => {
      debugLog('[VentasPage] realtime update');
      loadData();
    },
  });

  let rtConnected = false;
  let rtError: string | null = null;
  let rtLastUpdate: string | Date | null = null;
  let onReconnect: () => void = () => window.location.reload();

  if (typeof realtimeState === 'string') {
    rtConnected = realtimeState === 'open';
    rtError = realtimeState === 'error' ? 'Connection error' : null;
  } else if (realtimeState && typeof realtimeState === 'object') {
    rtConnected = typeof realtimeState.connected === 'boolean'
      ? !!realtimeState.connected
      : realtimeState.status === 'open';
    rtError = typeof realtimeState.error === 'string'
      ? realtimeState.error
      : realtimeState.status === 'error'
        ? 'Connection error'
        : null;
    rtLastUpdate = realtimeState.lastUpdate ?? null;
    if (typeof realtimeState.manualReconnect === 'function') onReconnect = realtimeState.manualReconnect;
  }

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handler = () => {
      debugLog('[VentasPage] evento debug:refetch-all');
      loadData();
    };
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
          {syncBanner?.visible && (
            <div className={`mt-4 text-sm rounded-xl border px-4 py-3 ${bannerClass}`}>
              {syncBanner.message ?? `Actualizado: ${new Date(syncBanner.when).toLocaleString()}`}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Filtros
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(event) => setDesde(event.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(event) => setHasta(event.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Sucursal</label>
              <div className="flex gap-2">
                <select
                  value={viewingAll ? '' : String(selectedSucursalId ?? '')}
                  onChange={(event) => setSelectedSucursalId(event.target.value ? String(event.target.value) : null)}
                  className="flex-1 px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Todas las sucursales</option>
                  {sucursales.map((sucursal) => (
                    <option key={String(sucursal.id)} value={String(sucursal.id)}>
                      {sucursal.nombre}
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
          <div className="mt-3">
            <button
              className="text-xs underline text-gray-500 dark:text-gray-400"
              onClick={() => setShowDebug((state) => !state)}
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

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <div className="font-semibold text-gray-900 dark:text-white flex flex-col">
              <span className="text-xl">Serie de ventas</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Fuente: RPC rpc_ui_series_14d(p_desde,p_hasta,p_sucursal_id)
              </span>
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
                  <YAxis
                    yAxisId="left"
                    stroke="#6b7280"
                    fontSize={12}
                    tickFormatter={(value: number) => formatCurrencyUSD(value)}
                    width={90}
                  />
                  <YAxis yAxisId="right" orientation="right" stroke="#6b7280" fontSize={12} width={70} />
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
                  <Bar yAxisId="right" dataKey="tickets" name="Tickets" opacity={0.75} barSize={24} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

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
                  {rows.map((row) => (
                    <tr key={row.nombre} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4">{row.nombre}</td>
                      <td className="px-6 py-4 text-right font-semibold">{formatCurrencyUSD(row.ventas)}</td>
                      <td className="px-6 py-4 text-right">{row.transacciones.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">{formatCurrencyUSD(row.ticketPromedio)}</td>
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
