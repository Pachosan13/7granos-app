import { useState, useEffect, useCallback } from 'react';
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

// Helpers
const usd = (v: number) => formatCurrencyUSD(Number(v || 0));
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
    ventasHoy: 0,
    transaccionesHoy: 0,
    ticketPromedio: 0,
    planillaActiva: 0,
    utilidadBruta: 0,
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

  const selectedIds = useCallback(() => {
    return sucursalFiltro === 'todas'
      ? sucursales.map(s => String(s.id))
      : [String(sucursalFiltro)];
  }, [sucursalFiltro, sucursales]);

  const applySucursalFilter = (qb: any, col: string) => {
    const ids = selectedIds();
    return ids.length > 0 ? qb.in(col, ids) : qb;
  };

  // === KPIs ===
  const loadKPIs = useCallback(async () => {
    if (sucursales.length === 0) return;
    const today = todayYMD();
    try {
      const { data: ventasHoy, error } = await supabase
        .from('invu_ventas')
        .select('total, sucursal_id, fecha')
        .gte('fecha', today)
        .lte('fecha', today)
        .in('sucursal_id', selectedIds());
      if (error) throw error;

      const totalVentas = ventasHoy.reduce((s, v) => s + Number(v.total || 0), 0);
      const totalTrans = ventasHoy.length;

      const now = new Date();
      const { data: planillaData } = await supabase
        .from('hr_periodo_totales')
        .select('total_costo_laboral, hr_periodo!inner(periodo_mes, periodo_ano, sucursal_id)')
        .eq('hr_periodo.periodo_mes', now.getMonth() + 1)
        .eq('hr_periodo.periodo_ano', now.getFullYear())
        .in('hr_periodo.sucursal_id', selectedIds());

      const costoLaboral = (planillaData ?? []).reduce((s, p) => s + Number(p.total_costo_laboral || 0), 0);
      setKpis({
        ventasHoy: totalVentas,
        transaccionesHoy: totalTrans,
        ticketPromedio: totalTrans > 0 ? totalVentas / totalTrans : 0,
        planillaActiva: costoLaboral,
        utilidadBruta: totalVentas * 0.65,
      });
    } catch (err) {
      console.error('[loadKPIs]', err);
    }
  }, [selectedIds, sucursales]);

  // === Ventas 30 días ===
  const loadVentasDiarias = useCallback(async () => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const from = since.toISOString().slice(0, 10);

    const { data } = await applySucursalFilter(
      supabase.from('invu_ventas').select('fecha,total').gte('fecha', from).order('fecha'),
      'sucursal_id'
    );

    const grouped: Record<string, { ventas: number; trans: number }> = {};
    (data ?? []).forEach(v => {
      grouped[v.fecha] ??= { ventas: 0, trans: 0 };
      grouped[v.fecha].ventas += Number(v.total || 0);
      grouped[v.fecha].trans += 1;
    });

    setVentasDiarias(
      Object.entries(grouped).map(([fecha, g]) => ({
        fecha: formatDateDDMMYYYY(fecha),
        ventas: g.ventas,
        transacciones: g.trans,
      }))
    );
  }, [applySucursalFilter]);

  // === Sucursal Summary ===
  const loadSucursalSummary = useCallback(async () => {
    const today = todayYMD();
    const { data, error } = await applySucursalFilter(
      supabase.from('invu_ventas').select('sucursal_id,total').eq('fecha', today),
      'sucursal_id'
    );
    if (error) return console.error(error);

    const map = new Map<string, { ventas: number; trans: number }>();
    (data ?? []).forEach((r: any) => {
      const k = String(r.sucursal_id);
      const cur = map.get(k) ?? { ventas: 0, trans: 0 };
      cur.ventas += Number(r.total || 0);
      cur.trans += 1;
      map.set(k, cur);
    });

    const nameById = new Map(sucursales.map(s => [String(s.id), s.nombre]));
    const summary = Array.from(map.entries()).map(([id, v]) => ({
      id,
      nombre: nameById.get(id) ?? `Sucursal ${id.slice(0, 6)}…`,
      ventas: v.ventas,
      transacciones: v.trans,
      ticketPromedio: v.trans ? v.ventas / v.trans : 0,
    }));

    if (sucursalFiltro === 'todas') {
      sucursales.forEach(s => {
        if (!summary.find(x => x.nombre === s.nombre))
          summary.push({ nombre: s.nombre, ventas: 0, transacciones: 0, ticketPromedio: 0 });
      });
    }

    setSucursalSummary(summary.sort((a, b) => b.ventas - a.ventas));
  }, [applySucursalFilter, sucursalFiltro, sucursales]);

  // === Alerts ===
  const loadAlerts = useCallback(async () => {
    const { data: creds } = await supabase.from('invu_credenciales').select('sucursal_id');
    const { data: act } = await supabase.from('sucursal').select('id,nombre').eq('activa', true);
    const faltantes = (act ?? []).filter(s => !(creds ?? []).some(c => c.sucursal_id === s.id));
    if (faltantes.length)
      setAlerts([{ id: 'missing', type: 'warning', title: 'Credenciales faltantes', message: `${faltantes.length} sin configurar`, icon: AlertTriangle }]);
  }, []);

  const loadDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    await Promise.all([loadKPIs(), loadVentasDiarias(), loadSucursalSummary(), loadAlerts()]);
    setDashboardLoading(false);
  }, [loadKPIs, loadVentasDiarias, loadSucursalSummary, loadAlerts]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const ymd = isEarlyPanamaHour(8) ? ymdInTZ('America/Panama', -1) : ymdInTZ('America/Panama', 0);
      const base = `${import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')}/functions/v1`;
      const resp = await fetch(`${base}/sync-ventas-v4?desde=${ymd}&hasta=${ymd}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      });
      await resp.json();
      setSyncStatus({ lastSyncTime: new Date(), syncMessage: '✓ Sincronización completada' });
      await loadDashboardData();
    } catch (err) {
      console.error(err);
      setSyncStatus({ lastSyncTime: new Date(), syncMessage: '✗ Error en sincronización' });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!authOrgLoading && sucursales.length) loadDashboardData();
  }, [authOrgLoading, sucursales.length, sucursalFiltro]);

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
        </motion.div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <KPICard title="Ventas del Día" value={kpis.ventasHoy} icon={DollarSign} color="bg-gradient-to-br from-green-500 to-emerald-600" prefix="$" />
          <KPICard title="Transacciones" value={kpis.transaccionesHoy} icon={Receipt} color="bg-gradient-to-br from-blue-500 to-cyan-600" />
          <KPICard title="Ticket Promedio" value={kpis.ticketPromedio} icon={TrendingUp} color="bg-gradient-to-br from-purple-500 to-pink-600" prefix="$" />
          <KPICard title="Planilla Activa" value={kpis.planillaActiva} icon={Users} color="bg-gradient-to-br from-orange-500 to-red-600" prefix="$" />
          <KPICard title="Utilidad Bruta" value={kpis.utilidadBruta} icon={PieChart} color="bg-gradient-to-br from-indigo-500 to-purple-600" prefix="$" />
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
