import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuthOrg } from '../context/AuthOrgContext';
import { KPICard } from '../components/KPICard';
import { formatCurrencyUSD, formatDateDDMMYYYY } from '../lib/format';
import { debugLog, getFunctionsBase } from '../utils/diagnostics';

type SerieRow = { dia: string; fecha: string; ventas: number; tickets: number };

type NullableNumber = number | string | null | undefined;

type RpcParamValue = NullableNumber | boolean;

type RpcParams = Record<string, RpcParamValue>;

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
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)) as Record<
    string,
    RpcParamValue
  >;
}

async function rpcWithFallback<T>(fn: string, variants: RpcParams[]): Promise<T | null> {
  let lastError: any = null;
  for (let index = 0; index < variants.length; index += 1) {
    const params = normalizeParams(variants[index]);
    const response = await supabase.rpc<T>(fn, params as Record<string, unknown>);
    if (!response.error) {
      if (index > 0) {
        console.warn(`[dashboard] ${fn} ejecutado con firma alternativa #${index + 1}`, params);
      }
      return response.data ?? null;
    }
    lastError = response.error;
  }
  throw lastError ?? new Error(`No se pudo ejecutar ${fn}`);
}

export default function DashboardExecutive() {
  const { sucursales, sucursalSeleccionada, getFilteredSucursalIds } = useAuthOrg();
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
    : sucursales.find((s) => String(s.id) === selectedSucursalId)?.nombre ?? 'Sucursal';

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const [ventasHoy, setVentasHoy] = useState(0);
  const [ticketsHoy, setTicketsHoy] = useState(0);
  const [ticketPromedio, setTicketPromedio] = useState(0);
  const [margenBruto, setMargenBruto] = useState(0);
  const [clientesActivos, setClientesActivos] = useState(0);

  const [serie, setSerie] = useState<SerieRow[]>([]);

  /*
   * Consulta KPIs diarios y serie agregada usando la RPC principal (rpc_ui_series_14d).
   * Filtra resultados cuando hay sucursal seleccionada para evitar mezclar datos.
   */
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const ids = viewingAll ? getFilteredSucursalIds() : selectedSucursalId ? [String(selectedSucursalId)] : [];

      let query = supabase.from('v_ui_kpis_hoy').select('*');
      if (!viewingAll && ids.length > 0) query = query.eq('sucursal_id', ids[0]);
      else if (viewingAll && ids.length > 0) query = query.in('sucursal_id', ids);

      const { data: kpis, error: kpisError } = await query;
      if (kpisError) throw kpisError;

      const totales = (kpis ?? []).reduce(
        (acc: any, row: any) => {
          acc.ventas += Number(row.ventas_brutas ?? 0);
          acc.tickets += Number(row.tickets ?? 0);
          acc.margen += Number(row.margen_bruto ?? 0);
          acc.clientes += 0;
          return acc;
        },
        { ventas: 0, tickets: 0, margen: 0, clientes: 0 }
      );

      setVentasHoy(totales.ventas);
      setTicketsHoy(totales.tickets);
      setTicketPromedio(totales.tickets > 0 ? totales.ventas / totales.tickets : 0);
      setMargenBruto(totales.margen);
      setClientesActivos(totales.clientes);

      const serieRpc =
        (await rpcWithFallback<any[]>('rpc_ui_series_14d', [
          { p_desde: desde, p_hasta: hasta, p_sucursal_id: viewingAll ? null : selectedSucursalId },
          { desde, hasta, p_sucursal_id: viewingAll ? null : selectedSucursalId },
          { desde, hasta, sucursal_id: viewingAll ? null : selectedSucursalId },
          { desde, hasta },
        ])) ?? [];

      const normalizedSucursalName = selectedSucursalName?.toLowerCase().trim();
      const serieFiltrada = serieRpc.filter((row: any) => {
        if (viewingAll) return true;
        const rowSucursalId = row.sucursal_id ?? row.sucursalId ?? row.sucursal ?? null;
        const rowSucursalName = (row.sucursal_nombre ?? row.sucursalName ?? row.sucursal ?? '')
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

      const agrupada = new Map<string, SerieRow>();
      for (const row of serieFiltrada) {
        const key = String(row.d ?? row.dia ?? row.fecha ?? hoy);
        if (!agrupada.has(key)) {
          agrupada.set(key, {
            dia: key,
            fecha: formatDateDDMMYYYY(key),
            ventas: 0,
            tickets: 0,
          });
        }
        const actual = agrupada.get(key)!;
        actual.ventas += toNumber(row.ventas ?? row.ventas_netas);
        actual.tickets += toNumber(row.transacciones ?? row.tx);
      }

      const ordenada = Array.from(agrupada.values()).sort((a, b) => a.dia.localeCompare(b.dia));
      setSerie(ordenada);

      setDebugInfo({
        filtro: { desde, hasta, viewingAll, selectedSucursalId, selectedSucursalName, ids },
        kpisCount: (kpis ?? []).length,
        serieCount: ordenada.length,
      });
    } catch (error) {
      debugLog('[Tablero] cargarDatos error', error);
      setVentasHoy(0);
      setTicketsHoy(0);
      setTicketPromedio(0);
      setMargenBruto(0);
      setClientesActivos(0);
      setSerie([]);
      setDebugInfo({ error: String(error) });
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
      const hoyActual = todayYMD();
      const url = `${base}/sync-ventas-v2b?desde=${hoyActual}&hasta=${hoyActual}`;
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await cargarDatos();
    } catch (error) {
      debugLog('[Tablero] sync error', error);
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 border dark:border-gray-700">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(event) => setDesde(event.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(event) => setHasta(event.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Sucursal</label>
              <div className="flex gap-2">
                <select
                  value={viewingAll ? '' : String(selectedSucursalId ?? '')}
                  onChange={(event) => setSelectedSucursalId(event.target.value ? String(event.target.value) : null)}
                  className="flex-1 px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900"
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <KPICard title="Ventas Hoy" value={ventasHoy} icon={Building2} color="bg-gradient-to-br from-blue-500 to-indigo-600" prefix="USD " />
        <KPICard title="Transacciones" value={ticketsHoy} icon={Building2} color="bg-gradient-to-br from-green-500 to-emerald-600" />
        <KPICard title="Ticket Promedio" value={ticketPromedio} icon={Building2} color="bg-gradient-to-br from-purple-500 to-fuchsia-600" prefix="USD " />
        <KPICard title="Margen Bruto" value={margenBruto} icon={Building2} color="bg-gradient-to-br from-amber-500 to-orange-600" prefix="USD " />
        <KPICard title="Clientes Activos" value={clientesActivos} icon={Building2} color="bg-gradient-to-br from-slate-500 to-slate-700" />
      </div>

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
                />
                <Bar yAxisId="right" dataKey="tickets" name="Tickets" fill="#10b981" opacity={0.8} barSize={22} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <pre className="text-xs text-gray-500 dark:text-gray-400">
        {debugInfo ? JSON.stringify(debugInfo, null, 2) : null}
      </pre>
    </div>
  );
}
