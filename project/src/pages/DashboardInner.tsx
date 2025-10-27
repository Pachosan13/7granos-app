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

/* ========= dependencias (deben declararse ANTES de usarlas) ========= */
const supabase = (SupaMod as any).supabase;

const useAuthOrg =
  (AuthOrgMod as any).useAuthOrg ??
  (() => {
    console.warn('useAuthOrg no encontrado; devolviendo stub');
    return { sucursales: [], sucursalSeleccionada: null, getFilteredSucursalIds: () => [] };
  });

const KPICard =
  (KPICardMod as any).KPICard ??
  (({ title, value, prefix }: any) => ( ... ));

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
      const { data: serieRpc, error: serieErr } = await supabase.rpc('rpc_ui_series_14d', {
        desde,
        hasta,
      });
      if (serieErr) throw serieErr;

      const serieFiltrada = (serieRpc ?? []).filter((r: any) =>
        viewingAll ? true : selectedSucursalName ? r.sucursal === selectedSucursalName : true
      );

      const map = new Map<string, { dia: string; fecha: string; ventas: number; tickets: number }>();
      for (const r of serieFiltrada) {
        const key = r.dia;
        if (!map.has(key))
          map.set(key, { dia: key, fecha: formatDateDDMMYYYY(key), ventas: 0, tickets: 0 });
        const e = map.get(key)!;
        e.ventas += Number(r.ventas ?? 0);
        e.tickets += Number(r.transacciones ?? 0);
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
