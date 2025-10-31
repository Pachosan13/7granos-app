import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw } from 'lucide-react';
import * as SupaMod from '../lib/supabase';
import * as AuthOrgMod from '../context/AuthOrgContext';
import * as KPICardMod from '../components/KPICard';
import { formatCurrencyUSD, formatDateDDMMYYYY } from '../lib/format';
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
import { debugLog, getFunctionsBase } from '../utils/diagnostics';

type SerieRow = { dia: string; fecha: string; ventas: number; tickets: number };

type NullableNumber = number | string | null | undefined;

type RpcParamValue = NullableNumber | boolean;

type RpcParams = Record<string, RpcParamValue>;

/* ========= helpers de fecha ========= */
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

function toNumber(value: NullableNumber): number {
  if (value === null || value === undefined) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeParams(params: RpcParams): Record<string, RpcParamValue> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as Record<string, RpcParamValue>;
}

async function rpcWithFallback<T>(fn: string, variants: RpcParams[]): Promise<T | null> {
  let lastError: any = null;
  for (let index = 0; index < variants.length; index += 1) {
    const params = normalizeParams(variants[index]);
    debugLog('[Tablero] rpcWithFallback intento', { fn, variant: index + 1, params });
    const response = await supabase.rpc<T>(fn, params as Record<string, unknown>);
    if (!response.error) {
      if (index > 0) {
        console.warn(`[dashboard] ${fn} ejecutado con firma alternativa #${index + 1}`, params);
        debugLog('[Tablero] rpcWithFallback variante resuelta', {
          fn,
          variant: index + 1,
          params,
        });
      }
      return response.data ?? null;
    }
    lastError = response.error;
    debugLog('[Tablero] rpcWithFallback error', {
      fn,
      variant: index + 1,
      params,
      error: response.error,
    });
  }
  debugLog('[Tablero] rpcWithFallback agotado', { fn, lastError });
  throw lastError ?? new Error(`No se pudo ejecutar ${fn}`);
}

/* ========= dependencias (deben declararse ANTES de usarlas) ========= */
const supabase = (SupaMod as any).supabase ?? SupaMod.default;

const useAuthOrg =
  (AuthOrgMod as any).useAuthOrg ??
  AuthOrgMod.default ??
  (() => {
    console.warn('useAuthOrg no encontrado; devolviendo stub');
    return { sucursales: [], sucursalSeleccionada: null, getFilteredSucursalIds: () => [] };
  });

const KPICard =
  (KPICardMod as any).KPICard ??
  KPICardMod.default ??
  (({ title, value, prefix }: any) => (
    <div className="rounded-xl border p-4">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-2xl font-semibold">
        {prefix ?? ''}
        {typeof value === 'number' ? value.toLocaleString() : String(value ?? '—')}
      </div>
    </div>
  ));

/* ========= componente ========= */
export default function DashboardInner() {
  const { sucursales, sucursalSeleccionada, getFilteredSucursalIds } = useAuthOrg();
  const functionsBase = useMemo(() => getFunctionsBase(), []);

  // filtros
  const hoy = useMemo(() => todayYMD(), []);
  const [desde, setDesde] = useState(addDays(hoy, -7));
  const [hasta, setHasta] = useState(hoy);

  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(
    sucursalSeleccionada?.id ? String(sucursalSeleccionada.id) : null
  );
  const viewingAll = selectedSucursalId === null;
  const selectedSucursalName = viewingAll
    ? null
    : sucursales.find((s: any) => String(s.id) === selectedSucursalId)?.nombre ?? 'Sucursal';

  // estado UI
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  // KPIs (hoy)
  const [ventasHoy, setVentasHoy] = useState(0);
  const [ticketsHoy, setTicketsHoy] = useState(0);
  const [ticketPromedio, setTicketPromedio] = useState(0);
  const [margenBruto, setMargenBruto] = useState(0);
  const [clientesActivos, setClientesActivos] = useState(0); // placeholder

  // Serie (últimos 7 días)
  const [serie, setSerie] = useState<SerieRow[]>([]);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      // 1) KPIs de hoy por sucursal
      const ids = viewingAll
        ? getFilteredSucursalIds()
        : selectedSucursalId
          ? [String(selectedSucursalId)]
          : [];

      let q = supabase.from('v_ui_kpis_hoy').select('*');
      if (!viewingAll && ids.length > 0) q = q.eq('sucursal_id', ids[0]);
      else if (viewingAll && ids.length > 0) q = q.in('sucursal_id', ids);

      const { data: kpis, error: kpisErr } = await q;
      if (kpisErr) throw kpisErr;

      const tot = (kpis ?? []).reduce(
        (acc: any, r: any) => {
          acc.ventas += Number(r.ventas_brutas ?? 0);
          acc.tickets += Number(r.tickets ?? 0);
          acc.margen += Number(r.margen_bruto ?? 0);
          acc.clientes += 0; // reemplazar cuando exista métrica real
          return acc;
        },
        { ventas: 0, tickets: 0, margen: 0, clientes: 0 }
      );
      setVentasHoy(tot.ventas);
      setTicketsHoy(tot.tickets);
      setTicketPromedio(tot.tickets > 0 ? tot.ventas / tot.tickets : 0);
      setMargenBruto(tot.margen);
      setClientesActivos(tot.clientes);

      // 2) Serie (RPC)
      const serieRpc =
        (await rpcWithFallback<any[]>('rpc_ui_series_14d', [
          { p_desde: desde, p_hasta: hasta, p_sucursal_id: viewingAll ? null : selectedSucursalId },
          { desde, hasta, p_sucursal_id: viewingAll ? null : selectedSucursalId },
          { desde, hasta, sucursal_id: viewingAll ? null : selectedSucursalId },
          { desde, hasta },
        ])) ?? [];

      const normalizedSucursalName = selectedSucursalName?.toLowerCase().trim();
      const serieFiltrada = serieRpc.filter((r: any) => {
        if (viewingAll) return true;
        const rowSucursalId = r.sucursal_id ?? r.sucursalId ?? r.sucursal ?? null;
        const rowSucursalName = (r.sucursal_nombre ?? r.sucursalName ?? r.sucursal ?? '')
          .toString()
          .toLowerCase()
          .trim();

        if (selectedSucursalId && rowSucursalId && String(rowSucursalId) === String(selectedSucursalId)) {
          return true;
        }
        if (normalizedSucursalName && rowSucursalName && rowSucursalName === normalizedSucursalName) {
          return true;
        }
        return false;
      });

      const map = new Map<string, { dia: string; fecha: string; ventas: number; tickets: number }>();
      for (const r of serieFiltrada) {
        const key = String(r.d ?? r.dia ?? r.fecha ?? hoy);
        if (!map.has(key)) {
          map.set(key, {
            dia: key,
            fecha: formatDateDDMMYYYY(key),
            ventas: 0,
            tickets: 0,
          });
        }
        const e = map.get(key)!;
        e.ventas += toNumber(r.ventas ?? r.ventas_netas);
        e.tickets += toNumber(r.transacciones ?? r.tx);
      }
      const serieOrdenada = Array.from(map.values()).sort((a, b) => a.dia.localeCompare(b.dia));
      setSerie(serieOrdenada);

      setDebugInfo({
        filtro: { desde, hasta, viewingAll, selectedSucursalId, selectedSucursalName, ids },
        kpisCount: (kpis ?? []).length,
        serieCount: serieOrdenada.length,
      });
    } catch (e) {
      debugLog('[Tablero] cargarDatos error', e);
      setVentasHoy(0);
      setTicketsHoy(0);
      setTicketPromedio(0);
      setMargenBruto(0);
      setClientesActivos(0);
      setSerie([]);
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
  ]);

  const handleSync = useCallback(async () => {
    const base = getFunctionsBase();
    if (!base) return;
    setSyncing(true);
    try {
      const hoy = todayYMD();
      const url = `${base}/sync-ventas-v2b?desde=${hoy}&hasta=${hoy}`;
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await cargarDatos();
    } catch (e) {
      debugLog('[Tablero] sync error', e);
    } finally {
      setSyncing(false);
    }
  }, [cargarDatos]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    if (sucursalSeleccionada?.id) setSelectedSucursalId(String(sucursalSeleccionada.id));
    else setSelectedSucursalId(null);
  }, [sucursalSeleccionada]);

  return (
    <div className="p-6 space-y-6">
      {/* Filtros / selector */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 border dark:border-gray-700">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Sucursal</label>
              <div className="flex gap-2">
                <select
                  value={viewingAll ? '' : String(selectedSucursalId ?? '')}
                  onChange={(e) => setSelectedSucursalId(e.target.value ? String(e.target.value) : null)}
                  className="flex-1 px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                  <option value="">Todas las sucursales</option>
                  {sucursales.map((s: any) => (
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
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <KPICard title="Ventas Hoy" value={ventasHoy} prefix="USD " />
        <KPICard title="Transacciones" value={ticketsHoy} />
        <KPICard title="Ticket Promedio" value={ticketPromedio} prefix="USD " />
        <KPICard title="Margen Bruto" value={margenBruto} prefix="USD " />
        <KPICard title="Clientes Activos" value={clientesActivos} />
      </div>

      {/* Serie 7 días */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border dark:border-gray-700">
        <div className="p-6 border-b dark:border-gray-700">
          <div className="font-semibold">Ventas últimos 7 días</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Fuente: RPC rpc_ui_series_14d</div>
        </div>
        <div className="h-80 px-6 pb-6">
          {loading || serie.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
              {loading ? 'Cargando…' : 'Sin datos en el rango seleccionado.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="fecha" stroke="#6b7280" fontSize={12} minTickGap={16} />
                <YAxis
                  yAxisId="left"
                  stroke="#6b7280"
                  fontSize={12}
                  tickFormatter={(v: number) => formatCurrencyUSD(v)}
                  width={90}
                />
                <YAxis yAxisId="right" orientation="right" stroke="#6b7280" fontSize={12} width={70} />
                <Tooltip
                  formatter={(v: number, name) =>
                    name === 'Ventas' ? formatCurrencyUSD(v) : v.toLocaleString()
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
                />
                <Bar yAxisId="right" dataKey="tickets" name="Tickets" fill="#10b981" opacity={0.8} barSize={22} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Debug */}
      <pre className="text-xs text-gray-500 dark:text-gray-400">
        {debugInfo ? JSON.stringify(debugInfo, null, 2) : null}
      </pre>
    </div>
  );
}
