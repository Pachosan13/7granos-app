import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { Building2, RefreshCw, DollarSign, Receipt, BarChart3, Wallet, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { ErrorState } from '../components/ErrorState';

type AuthOrgBranch = { id: string; nombre: string };

type AuthOrgHook = () => {
  sucursales: AuthOrgBranch[];
  sucursalSeleccionada: AuthOrgBranch | null;
  getFilteredSucursalIds?: () => unknown[];
};

type KPICardProps = {
  title: string;
  value: number;
  prefix?: string;
  icon: LucideIcon;
  color: string;
  trend?: number;
  onClick?: () => void;
};

type KpiRow = {
  sucursal_id?: string | null;
  ventas_brutas?: number | null;
  tickets?: number | null;
  margen_bruto?: number | null;
  clientes_activos?: number | null;
};

type DebugInfo = {
  offline: boolean;
  filtro: {
    desde: string;
    hasta: string;
    viewingAll: boolean;
    selectedSucursalId: string | null;
    selectedSucursalName: string | null;
    rawIds: string[];
  };
  kpisCount: number;
  serieCount: number;
  serieFallback?: string | null;
  fallbackReason?: string | null;
  error?: string;
};

const { supabase: supabaseClientRaw, isSupabaseConfigured: configuredFlag, shouldUseDemoMode: shouldUseDemoFlag } =
  SupaMod as {
    supabase?: SupabaseClient<unknown, 'public', unknown> | null;
    isSupabaseConfigured?: boolean;
    shouldUseDemoMode?: boolean;
  };

const supabaseClient: SupabaseClient<unknown, 'public', unknown> | null = supabaseClientRaw ?? null;
const isSupabaseConfigured = typeof configuredFlag === 'boolean' ? configuredFlag : Boolean(supabaseClient);
const shouldUseDemoDefault = typeof shouldUseDemoFlag === 'boolean' ? shouldUseDemoFlag : false;

const useAuthOrg: AuthOrgHook =
  (AuthOrgMod as { useAuthOrg?: AuthOrgHook }).useAuthOrg ??
  (() => {
    console.warn('useAuthOrg no encontrado; devolviendo stub');
    return { sucursales: [], sucursalSeleccionada: null, getFilteredSucursalIds: () => [] };
  });

const KPICard: ComponentType<KPICardProps> =
  (KPICardMod as { KPICard?: ComponentType<KPICardProps> }).KPICard ??
  (({ title, value, prefix, icon: Icon }) => (
    <div className="rounded-xl border p-4 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm text-slate-500">{title}</div>
        <div className="text-2xl font-semibold">
          {prefix ?? ''}
          {value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  ));

type SerieRow = { dia: string; fecha: string; ventas: number; tickets: number };

type RawSerieRow = {
  dia?: string | null;
  fecha?: string | null;
  sucursal_id?: string | null;
  sucursal?: string | null;
  ventas?: number | null;
  transacciones?: number | null;
};

type OfflineDataset = {
  kpis: Array<{
    sucursal_id: string;
    sucursal: string;
    ventas_brutas: number;
    tickets: number;
    margen_bruto: number;
  }>;
  serie: Array<{
    dia: string;
    fecha: string;
    sucursal_id: string;
    sucursal: string;
    ventas: number;
    transacciones: number;
  }>;
};

/** Helpers de fecha */
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

function sanitizeRange(desde: string, hasta: string): { start: string; end: string } | null {
  if (!desde || !hasta) return null;
  return desde <= hasta ? { start: desde, end: hasta } : { start: hasta, end: desde };
}

const asArray = <T,>(value: unknown, mapper?: (item: unknown) => T): T[] => {
  if (!Array.isArray(value)) return [];
  if (!mapper) return value as T[];
  return (value as unknown[]).map((item) => mapper(item));
};

const buildOfflineDataset = (hoy: string): OfflineDataset => {
  const offlineSucursales = [
    { id: 'sucursal-centro', nombre: 'Sucursal Centro' },
    { id: 'sucursal-norte', nombre: 'Sucursal Norte' },
  ];

  const kpis = offlineSucursales.map((sucursal, idx) => ({
    sucursal_id: sucursal.id,
    sucursal: sucursal.nombre,
    ventas_brutas: 9500 + idx * 2500,
    tickets: 180 + idx * 45,
    margen_bruto: 2800 + idx * 600,
  }));

  const serie: OfflineDataset['serie'] = [];

  for (let offset = -13; offset <= 0; offset++) {
    const dia = addDays(hoy, offset);
    for (const [idx, sucursal] of offlineSucursales.entries()) {
      const base = 6000 + idx * 1200;
      const trend = (offset + 13) * 250;
      const ventas = base + trend;
      const transacciones = 90 + idx * 15 + (offset + 13) * 2;
      serie.push({
        dia,
        fecha: formatDateDDMMYYYY(dia),
        sucursal_id: sucursal.id,
        sucursal: sucursal.nombre,
        ventas,
        transacciones,
      });
    }
  }

  return { kpis, serie };
};

const aggregateSerie = (rows: RawSerieRow[]): SerieRow[] => {
  const map = new Map<string, { dia: string; fecha: string; ventas: number; tickets: number }>();
  for (const row of rows) {
    if (!row?.dia) continue;
    const key = row.dia;
    const bucket = map.get(key) ?? {
      dia: key,
      fecha: formatDateDDMMYYYY(key),
      ventas: 0,
      tickets: 0,
    };
    bucket.ventas += Number(row.ventas ?? 0);
    bucket.tickets += Number(row.transacciones ?? 0);
    map.set(key, bucket);
  }
  return Array.from(map.values()).sort((a, b) => a.dia.localeCompare(b.dia));
};

/** ========= componente ========= */
export default function DashboardInner() {
  const { sucursales, sucursalSeleccionada, getFilteredSucursalIds } = useAuthOrg();
  const functionsBase = useMemo(() => getFunctionsBase(), []);

  const demoEnabled = shouldUseDemoDefault || !isSupabaseConfigured || !supabaseClient;

  const hoy = useMemo(() => todayYMD(), []);
  const [desde, setDesde] = useState(addDays(hoy, -7));
  const [hasta, setHasta] = useState(hoy);
  const offlineDataset = useMemo(() => buildOfflineDataset(hoy), [hoy]);

  const safeSucursales = useMemo(() => asArray<{ id: string; nombre: string }>(sucursales), [sucursales]);

  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(
    sucursalSeleccionada?.id ? String(sucursalSeleccionada.id) : null
  );
  const viewingAll = selectedSucursalId === null;
  const selectedSucursalName = viewingAll
    ? null
    : safeSucursales.find((s) => String(s.id) === selectedSucursalId)?.nombre ?? 'Sucursal';

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [errorState, setErrorState] = useState<{ code: string; detail?: string } | null>(null);

  const [ventasHoy, setVentasHoy] = useState(0);
  const [ticketsHoy, setTicketsHoy] = useState(0);
  const [ticketPromedio, setTicketPromedio] = useState(0);
  const [margenBruto, setMargenBruto] = useState(0);
  const [clientesActivos, setClientesActivos] = useState(0);

  const [serie, setSerie] = useState<SerieRow[]>([]);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setErrorState(null);

    let start = desde;
    let end = hasta;
    let rawIds: string[] = [];
    let allowedIds: Set<string> | null = null;

    const applyOfflineDataset = (reason: string | null) => {
      if (!offlineDataset) {
        throw new Error('Dataset offline no disponible');
      }
      const filterSet = allowedIds;
      const filteredKpis = viewingAll
        ? offlineDataset.kpis.filter((kpi) => (filterSet ? filterSet.has(String(kpi.sucursal_id)) : true))
        : offlineDataset.kpis.filter((kpi) => String(kpi.sucursal_id) === String(selectedSucursalId));

      const totals = filteredKpis.reduce(
        (acc, row) => {
          acc.ventas += Number(row.ventas_brutas ?? 0);
          acc.tickets += Number(row.tickets ?? 0);
          acc.margen += Number(row.margen_bruto ?? 0);
          return acc;
        },
        { ventas: 0, tickets: 0, margen: 0 }
      );

      const serieFiltrada = offlineDataset.serie.filter((row) => {
        if (row.dia < start || row.dia > end) return false;
        if (viewingAll) return filterSet ? filterSet.has(String(row.sucursal_id)) : true;
        return String(row.sucursal_id) === String(selectedSucursalId);
      });

      const serieOrdenada = aggregateSerie(serieFiltrada);

      setVentasHoy(totals.ventas);
      setTicketsHoy(totals.tickets);
      setTicketPromedio(totals.tickets > 0 ? totals.ventas / totals.tickets : 0);
      setMargenBruto(totals.margen);
      setClientesActivos(125 + (viewingAll ? 80 : 40));
      setSerie(serieOrdenada);
      setDebugInfo({
        offline: true,
        filtro: { desde: start, hasta: end, viewingAll, selectedSucursalId, selectedSucursalName, rawIds },
        kpisCount: filteredKpis.length,
        serieCount: serieOrdenada.length,
        fallbackReason: reason,
      });
    };

    try {
      const range = sanitizeRange(desde, hasta);
      if (!range) {
        throw new Error('Rango de fechas incompleto');
      }
      ({ start, end } = range);

      rawIds = viewingAll
        ? asArray(getFilteredSucursalIds?.(), (id) => String(id))
        : selectedSucursalId
        ? [String(selectedSucursalId)]
        : [];
      allowedIds = rawIds.length > 0 ? new Set(rawIds.map(String)) : null;
      const allowedIdList = allowedIds ? Array.from(allowedIds) : null;

      if (demoEnabled) {
        const reason = !isSupabaseConfigured || !supabaseClient ? 'supabase-missing' : 'demo-mode';
        applyOfflineDataset(reason);
        return;
      }

      if (!supabaseClient) {
        applyOfflineDataset('supabase-missing');
        return;
      }

      let query = supabaseClient.from('v_ui_kpis_hoy').select('*');
      if (!viewingAll && rawIds.length > 0) {
        query = query.eq('sucursal_id', rawIds[0]);
      } else if (viewingAll && rawIds.length > 0) {
        query = query.in('sucursal_id', rawIds);
      }

      const { data: kpisData, error: kpisErr } = await query;
      if (kpisErr) throw kpisErr;

      const kpis = asArray<KpiRow>(kpisData);
      const totals = kpis.reduce(
        (acc, row) => {
          acc.ventas += Number(row?.ventas_brutas ?? 0);
          acc.tickets += Number(row?.tickets ?? 0);
          acc.margen += Number(row?.margen_bruto ?? 0);
          acc.clientes += Number(row?.clientes_activos ?? 0);
          return acc;
        },
        { ventas: 0, tickets: 0, margen: 0, clientes: 0 }
      );
      setVentasHoy(totals.ventas);
      setTicketsHoy(totals.tickets);
      setTicketPromedio(totals.tickets > 0 ? totals.ventas / totals.tickets : 0);
      setMargenBruto(totals.margen);
      setClientesActivos(totals.clientes);

      const { data: serieRpc, error: serieErr } = await supabaseClient.rpc('rpc_ui_series_14d', {
        desde: start,
        hasta: end,
      });

      let serieRows = asArray<RawSerieRow>(serieRpc);
      let primaryError: PostgrestError | null = null;
      if (serieErr) {
        primaryError = serieErr;
        debugLog('[Tablero] rpc_ui_series_14d falló, intentando fallback', serieErr);
        let fallbackQuery = supabaseClient
          .from('v_ui_series_14d')
          .select('dia, sucursal_id, sucursal, ventas, transacciones')
          .gte('dia', start)
          .lte('dia', end);
        if (allowedIdList && allowedIdList.length > 0) {
          fallbackQuery = fallbackQuery.in('sucursal_id', allowedIdList);
        }
        const fallback = await fallbackQuery;
        if (fallback.error) {
          throw new Error(
            `Fallback serie falló: ${fallback.error.message ?? fallback.error.toString()} (${fallback.error.code ?? 'sin código'})`
          );
        }
        serieRows = asArray<RawSerieRow>(fallback.data);
      }

      const serieFiltrada = serieRows.filter((row) => {
        const rowId = row?.sucursal_id ? String(row.sucursal_id) : null;
        if (viewingAll) {
          if (!allowedIds || allowedIds.size === 0) return true;
          if (rowId && allowedIds.has(rowId)) return true;
          return false;
        }
        if (!allowedIds || allowedIds.size === 0) return true;
        if (rowId && allowedIds.has(rowId)) {
          return true;
        }
        if (selectedSucursalName && row?.sucursal) {
          return String(row.sucursal) === selectedSucursalName;
        }
        return false;
      });

      const serieOrdenada = aggregateSerie(serieFiltrada);
      setSerie(serieOrdenada);
      setDebugInfo({
        offline: false,
        filtro: { desde: start, hasta: end, viewingAll, selectedSucursalId, selectedSucursalName, rawIds },
        kpisCount: kpis.length,
        serieCount: serieOrdenada.length,
        serieFallback: primaryError ? 'v_ui_series_14d' : null,
        fallbackReason: primaryError ? 'rpc-failed' : null,
      });
    } catch (error) {
      debugLog('[Tablero] cargarDatos error', error);
      const message = error instanceof Error ? error.message : String(error);

      try {
        if (!demoEnabled) {
          applyOfflineDataset('supabase-error');
        }
      } catch (offlineError) {
        debugLog('[Tablero] offline fallback error', offlineError);
        setVentasHoy(0);
        setTicketsHoy(0);
        setTicketPromedio(0);
        setMargenBruto(0);
        setClientesActivos(0);
        setSerie([]);
      }

      setErrorState({ code: '130', detail: message });
      setDebugInfo({
        offline: demoEnabled,
        filtro: { desde: start, hasta: end, viewingAll, selectedSucursalId, selectedSucursalName, rawIds },
        kpisCount: 0,
        serieCount: 0,
        fallbackReason: 'supabase-error',
        error: message,
      });
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
    demoEnabled,
    offlineDataset,
  ]);

  const handleSync = useCallback(async () => {
    if (demoEnabled) {
      await cargarDatos();
      return;
    }
    const base = functionsBase;
    if (!base) return;
    setSyncing(true);
    try {
      const hoyFecha = todayYMD();
      const url = `${base}/sync-ventas-v2b?desde=${hoyFecha}&hasta=${hoyFecha}`;
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await cargarDatos();
    } catch (e) {
      debugLog('[Tablero] sync error', e);
    } finally {
      setSyncing(false);
    }
  }, [functionsBase, cargarDatos, demoEnabled]);

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
                  {safeSucursales.map((s) => (
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <KPICard
          title="Ventas Hoy"
          value={ventasHoy}
          prefix="USD "
          icon={DollarSign}
          color="bg-gradient-to-br from-green-500 to-emerald-600"
        />
        <KPICard
          title="Transacciones"
          value={ticketsHoy}
          icon={Receipt}
          color="bg-gradient-to-br from-blue-500 to-indigo-600"
        />
        <KPICard
          title="Ticket Promedio"
          value={ticketPromedio}
          prefix="USD "
          icon={BarChart3}
          color="bg-gradient-to-br from-purple-500 to-violet-600"
        />
        <KPICard
          title="Margen Bruto"
          value={margenBruto}
          prefix="USD "
          icon={Wallet}
          color="bg-gradient-to-br from-amber-500 to-orange-500"
        />
        <KPICard
          title="Clientes Activos"
          value={clientesActivos}
          icon={Users}
          color="bg-gradient-to-br from-pink-500 to-rose-600"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border dark:border-gray-700">
        <div className="p-6 border-b dark:border-gray-700">
          <div className="font-semibold">Ventas últimos 7 días</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Fuente: RPC rpc_ui_series_14d</div>
        </div>
        <div className="h-80 px-6 pb-6">
          {errorState ? (
            <ErrorState code={errorState.code} retry onRetry={cargarDatos} message={errorState.detail} />
          ) : loading || serie.length === 0 ? (
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
                    name === 'Ventas' ? formatCurrencyUSD(v) : (v as number).toLocaleString()
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
