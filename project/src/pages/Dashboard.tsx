import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  DollarSign, Receipt, TrendingUp, Users, PieChart,
  RefreshCw, AlertTriangle, Building2, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Area,
} from 'recharts';
import { useAuthOrg } from '../context/AuthOrgContext';
import { LiveClock } from '../components/LiveClock';
import { KPICard } from '../components/KPICard';
import { RealtimeStatusIndicator } from '../components/RealtimeStatusIndicator';
import { supabase } from '../lib/supabase';
import { formatCurrencyUSD, formatDateDDMMYYYY } from '../lib/format';
import { useRealtimeVentas } from '../hooks/useRealtimeVentas';
import { debugLog, getFunctionsBase, isColumnMissing } from '../utils/diagnostics';

// Helpers
const usd = (v: number) => formatCurrencyUSD(Number(v || 0));
const safeStr = (value: unknown) => (value ?? '').toString();
const todayYMD = () => {
  const tz = 'America/Panama';
  const nowPa = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  return nowPa.toISOString().slice(0, 10);
};
const ymdInTZ = (tz: string, offsetDays = 0) => {
  const nowTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  nowTz.setDate(nowTz.getDate() + offsetDays);
  return nowTz.toISOString().slice(0, 10);
};
const isEarlyPanamaHour = (limitHour = 8) => {
  const nowPa = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Panama' }));
  return nowPa.getHours() < limitHour;
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const { sucursales, loading: authOrgLoading } = useAuthOrg();

  const [sucursalFiltro, setSucursalFiltro] = useState<string>('todas');
  const [kpis, setKpis] = useState({
    ventasBrutas: 0,
    cogs: 0,
    margen: 0,
    tickets: 0,
    lineas: 0,
  });
  const [ventasDiarias, setVentasDiarias] = useState<any[]>([]);
  const [sucursalSummary, setSucursalSummary] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    lastSyncTime: null as Date | null,
    syncMessage: null as string | null,
  });
  const functionsBase = useMemo(() => getFunctionsBase(), []);

  const registerAlert = useCallback((alert: any) => {
    setAlerts(prev => {
      const filtered = prev.filter((item: any) => item.id !== alert.id);
      return [...filtered, alert];
    });
  }, []);

  const clearAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter((item: any) => item.id !== id));
  }, []);

  const selectedIds = useCallback(() => {
    return sucursalFiltro === 'todas'
      ? sucursales.map(s => String(s.id))
      : [String(sucursalFiltro)];
  }, [sucursalFiltro, sucursales]);

  // === KPIs ===
  const loadKPIs = useCallback(async () => {
    const view = 'v_ui_kpis_hoy';
    const today = todayYMD();
    const selectedId = sucursalFiltro === 'todas' ? null : String(sucursalFiltro);
    let segmentationSupported = true;

    try {
      let query = supabase.from(view).select('*');
      if (selectedId) {
        query = query.eq('sucursal_id', selectedId);
      }
      const { data, error } = await query;

      let rows: Record<string, any>[] = [];
      if (error) {
        if (selectedId && isColumnMissing(error)) {
          segmentationSupported = false;
        } else {
          throw error;
        }
      } else {
        rows = data ?? [];
      }

      if (!segmentationSupported) {
        const { data: fallbackData, error: fallbackError } = await supabase.from(view).select('*');
        if (fallbackError) throw fallbackError;
        rows = fallbackData ?? [];
        registerAlert({
          id: 'kpi-segmentation-warning',
          type: 'warning',
          title: 'Vista sin segmentación',
          message: 'Esta vista no soporta segmentación por sucursal; mostrando totales.',
          icon: AlertTriangle,
        });
      } else {
        clearAlert('kpi-segmentation-warning');
      }

      const filteredRows = rows.filter(row => !row?.dia || row.dia === today);

      const aggregate = filteredRows.reduce(
        (acc, row: Record<string, any>) => {
          const ventas = Number(row.ventas ?? row.ventas_brutas ?? row.total_bruto ?? 0);
          const cogs = Number(row.cogs ?? row.costo ?? 0);
          const margen = Number(row.margen ?? row.margen_bruto ?? ventas - cogs);
          const tickets = Number(row.tickets ?? row.transacciones ?? 0);
          const lineas = Number(row.lineas ?? row.line_items ?? 0);
          return {
            ventasBrutas: acc.ventasBrutas + ventas,
            cogs: acc.cogs + cogs,
            margen: acc.margen + margen,
            tickets: acc.tickets + tickets,
            lineas: acc.lineas + lineas,
          };
        },
        { ventasBrutas: 0, cogs: 0, margen: 0, tickets: 0, lineas: 0 }
      );

      setKpis(aggregate);
      clearAlert('kpi-error');
    } catch (err) {
      debugLog('[Dashboard] loadKPIs error', err);
      registerAlert({
        id: 'kpi-error',
        type: 'error',
        title: 'Error cargando KPIs',
        message: err instanceof Error ? err.message : 'No fue posible leer v_ui_kpis_hoy.',
        icon: AlertTriangle,
      });
      setKpis({ ventasBrutas: 0, cogs: 0, margen: 0, tickets: 0, lineas: 0 });
    }
  }, [clearAlert, registerAlert, sucursalFiltro]);


  // === Ventas 30 días ===
  const loadVentasDiarias = useCallback(async () => {
    const today = todayYMD();
    const start = ymdInTZ('America/Panama', -13);
    let segmentationSupported = true;
    try {
      let query = supabase
        .from('v_ui_series_14d')
        .select('*')
        .gte('dia', start)
        .lte('dia', today)
        .order('dia', { ascending: true });

      if (sucursalFiltro !== 'todas') {
        const ids = selectedIds();
        if (ids.length > 0) {
          query = query.eq('sucursal_id', ids[0]);
        }
      }

      const { data, error } = await query;
      let sourceRows: Record<string, any>[] = [];
      if (error) {
        if (sucursalFiltro !== 'todas' && isColumnMissing(error)) {
          segmentationSupported = false;
          registerAlert({
            id: 'series-segmentation-warning',
            type: 'warning',
            title: 'Vista sin segmentación',
            message: 'Esta vista no soporta segmentación por sucursal; mostrando totales.',
            icon: AlertTriangle,
          });
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('v_ui_series_14d')
            .select('*')
            .gte('dia', start)
            .lte('dia', today)
            .order('dia', { ascending: true });
          if (fallbackError) throw fallbackError;
          sourceRows = fallbackData ?? [];
        } else {
          throw error;
        }
      } else {
        sourceRows = data ?? [];
        clearAlert('series-segmentation-warning');
      }

      const rawRows = sourceRows.map((row: Record<string, any>) => ({
        dia: row.dia as string,
        fecha: formatDateDDMMYYYY(row.dia),
        ventas: Number(row.ventas ?? 0),
        margen: Number(row.margen ?? 0),
        tickets: Number(row.tickets ?? 0),
        lineas: Number(row.lineas ?? 0),
        cogs: Number(row.cogs ?? 0),
        sucursal_id: row.sucursal_id != null ? String(row.sucursal_id) : undefined,
        sucursal_nombre: row.sucursal_nombre ?? row.nombre ?? undefined,
      }));

      const chartRows =
        sucursalFiltro === 'todas'
          ? Array.from(
              rawRows.reduce((map, row) => {
                const entry = map.get(row.dia) ?? {
                  dia: row.dia,
                  fecha: row.fecha,
                  ventas: 0,
                  margen: 0,
                  tickets: 0,
                  lineas: 0,
                  cogs: 0,
                };
                entry.ventas += row.ventas;
                entry.margen += row.margen;
                entry.tickets += row.tickets;
                entry.lineas += row.lineas;
                entry.cogs += row.cogs;
                map.set(row.dia, entry);
                return map;
              }, new Map<string, any>())
            ).sort((a, b) => safeStr(a.dia).localeCompare(safeStr(b.dia)))
          : rawRows;

      setVentasDiarias(
        chartRows.map(row => ({
          ...row,
          transacciones: row.tickets,
        }))
      );

      const todaysRows = rawRows.filter(row => row.dia === today);
      if (todaysRows.length > 0) {
        if (segmentationSupported) {
          const summaryMap = todaysRows.reduce((acc, row) => {
            const key = row.sucursal_id ?? row.sucursal_nombre ?? 'sin-id';
            const current = acc.get(key) ?? {
              id: key,
              nombre: row.sucursal_nombre ?? `Sucursal ${String(key).slice(0, 6) || 'N/D'}`,
              ventas: 0,
              transacciones: 0,
            };
            current.ventas += row.ventas;
            current.transacciones += row.tickets;
            acc.set(key, current);
            return acc;
          }, new Map<string, any>());

          const summary = Array.from(summaryMap.values()).map((entry: any) => ({
            ...entry,
            ticketPromedio: entry.transacciones > 0 ? entry.ventas / entry.transacciones : 0,
          }));

          setSucursalSummary(summary.sort((a, b) => b.ventas - a.ventas));
          clearAlert('sucursal-summary-error');
        } else {
          const totals = todaysRows.reduce(
            (acc, row) => ({
              ventas: acc.ventas + row.ventas,
              transacciones: acc.transacciones + row.tickets,
            }),
            { ventas: 0, transacciones: 0 }
          );
          setSucursalSummary([{
            id: 'global',
            nombre: 'Todas las sucursales',
            ventas: totals.ventas,
            transacciones: totals.transacciones,
            ticketPromedio: totals.transacciones > 0 ? totals.ventas / totals.transacciones : 0,
          }]);
          clearAlert('sucursal-summary-error');
        }
      } else {
        setSucursalSummary([]);
        registerAlert({
          id: 'sucursal-summary-error',
          type: 'warning',
          title: 'Sin datos de hoy',
          message: 'v_ui_series_14d no devolvió registros para el día actual.',
          icon: AlertTriangle,
        });
      }

      clearAlert('ventas-diarias-error');
    } catch (err) {
      debugLog('[Dashboard] loadVentasDiarias error', err);
      registerAlert({
        id: 'ventas-diarias-error',
        type: 'error',
        title: 'Ventas (14 días)',
        message: err instanceof Error ? err.message : 'No se pudieron obtener los datos de v_ui_series_14d.',
        icon: AlertTriangle,
      });
      setVentasDiarias([]);
      setSucursalSummary([]);
    }
  }, [clearAlert, registerAlert, selectedIds, sucursalFiltro]);

  /* const loadVentasDiariasLegacy = useCallback(async () => {
    try {
      const { data, error, status } = await supabase
        .from('v_ui_series_14d')
        .select('*')
        .order('dia', { ascending: true });
      if (error) {
        if (status === 400) {
          registerAlert({
            id: 'ventas-diarias-error',
            type: 'warn',
            title: 'Vista v_ui_series_14d',
            message: isColumnMissing(error) ? 'Datos no disponibles para esta vista (v_ui_series_14d).' : error.message,
            icon: AlertTriangle,
          });
          setVentasDiarias([]);
          setSucursalSummary([]);
          return;
        }
        throw error;
      }

      const dataset = (data ?? []).map((row: Record<string, any>) => ({
        dia: row.dia,
        fecha: formatDateDDMMYYYY(row.dia),
        ventas: Number(row.ventas_brutas ?? row.total_bruto ?? 0),
        margen: Number(row.margen ?? row.margen_bruto ?? 0),
        tickets: Number(row.tickets ?? row.transacciones ?? 0),
        lineas: Number(row.lineas ?? row.line_items ?? 0),
        cogs: Number(row.cogs ?? row.costo ?? 0),
        transacciones: Number(row.tickets ?? row.transacciones ?? 0),
        sucursal_id: row.sucursal_id,
        sucursal_nombre: row.sucursal_nombre ?? row.nombre ?? undefined,
      }));

      setVentasDiarias(dataset);

      const today = todayYMD();
      const todaysRows = dataset.filter(row => row.dia === today);
      if (todaysRows.length > 0) {
        const summary = todaysRows.map(row => ({
          id: row.sucursal_id ?? row.sucursal_nombre ?? row.dia,
          nombre: row.sucursal_nombre ?? `Sucursal ${String(row.sucursal_id ?? '').slice(0, 6) || 'N/D'}`,
          ventas: row.ventas,
          transacciones: row.tickets,
          ticketPromedio: row.tickets ? row.ventas / row.tickets : 0,
        }));
        setSucursalSummary(summary.sort((a, b) => b.ventas - a.ventas));
        clearAlert('sucursal-summary-error');
      } else {
        setSucursalSummary([]);
        registerAlert({
          id: 'sucursal-summary-error',
          type: 'warning',
          title: 'Sin datos de hoy',
          message: 'v_ui_series_14d no devolvió registros para el día actual.',
          icon: AlertTriangle,
        });
      }

      clearAlert('ventas-diarias-error');
    } catch (err) {
      debugLog('[Dashboard] loadVentasDiarias error', err);
      registerAlert({
        id: 'ventas-diarias-error',
        type: 'error',
        title: 'Ventas (14 días)',
        message: 'No se pudieron obtener los datos de v_ui_series_14d.',
        icon: AlertTriangle,
      });
      setVentasDiarias([]);
      setSucursalSummary([]);
    }
  }, [clearAlert, registerAlert]); */

  // === Sucursal Summary ===
  // === Alerts ===
  const loadAlerts = useCallback(async () => {
    try {
      const { data: creds, error: credsError } = await supabase.from('invu_credenciales').select('sucursal_id');
      if (credsError) throw credsError;

      const { data: act, error: actError } = await supabase.from('sucursal').select('id,nombre').eq('activa', true);
      if (actError) throw actError;

      const faltantes = (act ?? []).filter(s => !(creds ?? []).some(c => c.sucursal_id === s.id));
      if (faltantes.length) {
        registerAlert({
          id: 'missing-creds',
          type: 'warning',
          title: 'Credenciales INVU faltantes',
          message: `${faltantes.length} sucursales sin token configurado`,
          icon: AlertTriangle,
        });
      } else {
        clearAlert('missing-creds');
      }
    } catch (err) {
      debugLog('[Dashboard] loadAlerts error', err);
    }
  }, [clearAlert, registerAlert]);

  const loadDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    await Promise.all([loadKPIs(), loadVentasDiarias(), loadAlerts()]);
    setDashboardLoading(false);
  }, [loadAlerts, loadKPIs, loadVentasDiarias]);

  const handleSync = useCallback(async () => {
    if (!functionsBase) {
      const message = 'Edge Function no configurada (revisa VITE_SUPABASE_FUNCTIONS_BASE).';
      setSyncStatus({ lastSyncTime: new Date(), syncMessage: `✗ ${message}` });
      registerAlert({
        id: 'sync-error',
        type: 'error',
        title: 'Sincronización no disponible',
        message,
        icon: AlertTriangle,
      });
      return;
    }

    setSyncing(true);
    try {
      const ymd = isEarlyPanamaHour(8) ? ymdInTZ('America/Panama', -1) : ymdInTZ('America/Panama', 0);
      const query = `?desde=${ymd}&hasta=${ymd}`;
      const endpoints = [
        `${functionsBase}/sync-ventas-detalle${query}`,
        `${functionsBase}/sync-ventas-v4${query}`,
        `${functionsBase}/sync-ventas${query}`,
      ];

      const invokeEndpoint = async (endpoint: string) => {
        debugLog('[Dashboard] sincronización →', endpoint);
        const run = async (retry: boolean): Promise<{ data: any; status: number }> => {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            return { data, status: response.status };
          }

          const body = await response.text().catch(() => '');
          if (response.status >= 500 && retry) {
            debugLog('[Dashboard] sync retry por status', response.status);
            return run(false);
          }

          let friendly = `HTTP ${response.status}`;
          if (response.status === 401 || response.status === 403) {
            friendly = 'Sesión caducada o permisos insuficientes.';
          } else if (response.status === 404) {
            friendly = 'Recurso de sincronización no encontrado.';
          } else if (response.status >= 500) {
            friendly = 'Servicio remoto con errores, reintenta en unos minutos.';
          }
          const error: any = new Error(`${friendly}${body ? ` · ${body.slice(0, 120)}` : ''}`);
          error.status = response.status;
          throw error;
        };

        return run(true);
      };

      let syncResult: any = null;
      let success = false;
      let lastError: any = null;

      for (const endpoint of endpoints) {
        try {
          const { data } = await invokeEndpoint(endpoint);
          syncResult = data;
          success = true;
          break;
        } catch (err: any) {
          lastError = err;
          if (err?.status === 404 && endpoint.includes('sync-ventas-detalle')) {
            debugLog('[Dashboard] sync-ventas-detalle no disponible, intentando fallback');
            continue;
          }
          if (err?.status === 404 && endpoint.includes('sync-ventas-v4')) {
            debugLog('[Dashboard] sync-ventas-v4 no disponible, probando sync-ventas');
            continue;
          }
          throw err;
        }
      }

      if (!success) {
        throw lastError ?? new Error('No fue posible ejecutar la sincronización');
      }

      debugLog('[Dashboard] sync result', syncResult);
      clearAlert('sync-error');
      setSyncStatus({ lastSyncTime: new Date(), syncMessage: '✓ Sincronización completada' });
      await loadDashboardData();
      window.dispatchEvent(new Event('debug:refetch-all'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en sincronización';
      setSyncStatus({ lastSyncTime: new Date(), syncMessage: `✗ ${message}` });
      registerAlert({
        id: 'sync-error',
        type: 'error',
        title: 'Sincronización fallida',
        message,
        icon: AlertTriangle,
      });
      debugLog('[Dashboard] handleSync error', err);
    } finally {
      setSyncing(false);
    }
  }, [clearAlert, functionsBase, loadDashboardData, registerAlert]);

  useEffect(() => {
    if (!authOrgLoading && sucursales.length) {
      loadDashboardData();
    }
  }, [authOrgLoading, loadDashboardData, sucursalFiltro, sucursales]);

  useEffect(() => {
    const handler = () => {
      debugLog('[Dashboard] evento debug:refetch-all recibido');
      loadDashboardData();
    };
    window.addEventListener('debug:refetch-all', handler);
    return () => window.removeEventListener('debug:refetch-all', handler);
  }, [loadDashboardData]);

  const realtimeStatus = useRealtimeVentas(() => loadDashboardData());
  const realtimeConnected = realtimeStatus === 'open';

  if (authOrgLoading || dashboardLoading)
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Cargando datos del dashboard...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="p-8 space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <img src="/branding/7granos-logo.png" alt="7 Granos" className="h-12 w-12 rounded-full" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Centro de Control 7 Granos</h1>
                <div className="flex items-center gap-4 text-gray-600">
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4" /><LiveClock /></div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <select value={sucursalFiltro} onChange={e => setSucursalFiltro(e.target.value)}
                      className="border rounded-lg px-2 py-1 text-sm">
                      <option value="todas">Todas las sucursales</option>
                      {sucursales.map(s => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
                    </select>
                  </div>
                  <RealtimeStatusIndicator connected={realtimeConnected} compact />
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end space-y-2">
              {syncStatus.lastSyncTime && (
                <span className="text-xs text-gray-600 bg-green-50 px-3 py-1 rounded-full">
                  Última sync: {syncStatus.lastSyncTime.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button onClick={handleSync} disabled={syncing}
                className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:scale-105 transition ${syncing ? 'opacity-60' : ''}`}>
                <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizando...' : 'Sincronizar Ahora'}
              </button>
              {syncStatus.syncMessage && (
                <div className={`text-xs px-3 py-1 rounded-lg ${
                  syncStatus.syncMessage.includes('✓') ? 'bg-green-100 text-green-800'
                    : syncStatus.syncMessage.includes('✗') ? 'bg-red-100 text-red-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {syncStatus.syncMessage}
                </div>
              )}
            </div>
          </div>
          {alerts.length > 0 && (
            <div className="mt-4 w-full space-y-3">
              {alerts.map((alert: any) => {
                const Icon = alert.icon ?? AlertTriangle;
                const palette =
                  alert.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : alert.type === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-blue-50 border-blue-200 text-blue-800';
                return (
                  <div key={alert.id} className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${palette}`}>
                    <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-sm">{alert.title}</div>
                      {alert.message && <p className="text-sm mt-0.5">{alert.message}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <KPICard title="Ventas Brutas" value={kpis.ventasBrutas} icon={DollarSign} color="bg-gradient-to-br from-green-500 to-emerald-600" prefix="$" />
          <KPICard title="COGS" value={kpis.cogs} icon={Receipt} color="bg-gradient-to-br from-blue-500 to-cyan-600" prefix="$" />
          <KPICard title="Margen Bruto" value={kpis.margen} icon={TrendingUp} color="bg-gradient-to-br from-purple-500 to-pink-600" prefix="$" />
          <KPICard title="Tickets" value={kpis.tickets} icon={Users} color="bg-gradient-to-br from-orange-500 to-red-600" />
          <KPICard title="Líneas" value={kpis.lineas} icon={PieChart} color="bg-gradient-to-br from-indigo-500 to-purple-600" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Ventas últimos 30 días */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Ventas Últimos 30 Días</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={ventasDiarias}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="fecha" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip />
                <Area type="monotone" dataKey="ventas" fill="#3b82f6" stroke="#3b82f6" strokeWidth={2} />
                <Bar dataKey="transacciones" fill="#10b981" opacity={0.7} />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Rendimiento por Sucursal */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Rendimiento por Sucursal (Hoy)</h3>
            <ResponsiveContainer width="100%" height={300}>
  <BarChart data={sucursalSummary}>
    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
    <XAxis
      dataKey="nombre"
      stroke="#6b7280"
      fontSize={12}
      interval={0}
      height={50}
    />
    <YAxis
      stroke="#6b7280"
      fontSize={12}
      tickFormatter={(v: number) => formatCurrencyUSD(v)}
      width={70}
    />
    <Tooltip />
    <Bar
      dataKey="ventas"
      fill="#10b981"
      radius={[8, 8, 0, 0]}
      barSize={32}
      onClick={(data: any) => {
        const nombre = data?.nombre;
        if (!nombre) return;
        const suc = sucursales.find((s) => s.nombre === nombre);
        const today = todayYMD();
        const params = new URLSearchParams({ fecha: today });
        if (suc?.id) params.set('sucursal_id', String(suc.id));
        navigate(`/ventas/detalle?${params.toString()}`);
      }}
    />
  </BarChart>
</ResponsiveContainer>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
