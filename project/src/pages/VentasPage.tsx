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

// === NUEVO: resuelve el filtro por sucursal usando código corto o nombre ===
function resolveSucursalFilter(
  sucursales: any[],
  selectedSucursalId: string | null
): { field: 'sucursal' | 'sucursal_nombre' | null; value: string | null } {
  if (!selectedSucursalId) return { field: null, value: null };
  const s = sucursales.find((x) => String(x.id) === String(selectedSucursalId));
  if (!s) return { field: null, value: null };

  // intenta usar un código corto si existe en el objeto del contexto
  const code =
    s.codigo ?? s.short ?? s.slug ?? s.sucursal ?? null;

  if (typeof code === 'string' && code.trim()) {
    return { field: 'sucursal', value: code.trim() };
  }

  // fallback por nombre visible
  const name = s.nombre ?? null;
  if (typeof name === 'string' && name.trim()) {
    return { field: 'sucursal_nombre', value: name.trim() };
  }

  return { field: null, value: null };
}

export function VentasPage() {
  const { sucursales, sucursalSeleccionada, getFilteredSucursalIds } = useAuthOrg();
  const functionsBase = useMemo(() => getFunctionsBase(), []);

  // --------- Filtros ---------
  const hoy = useMemo(() => todayYMD(), []);
  const [desde, setDesde] = useState(addDays(hoy, -7));
  const [hasta, setHasta] = useState(hoy);

  // IDs como string (UUID del contexto)
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
      const filter = resolveSucursalFilter(sucursales, selectedSucursalId);

      // Query base
      let seriesQuery = supabase
        .from('v_ui_series_14d')
        .select('*')
        .gte('dia', desde)
        .lte('dia', hasta)
        .order('dia', { ascending: true });

      // Filtro “todas” o “una”
      if (!viewingAll && filter.field && filter.value) {
        seriesQuery = seriesQuery.eq(filter.field, filter.value);
      }
      // Si quisieras filtrar “varias” por códigos cortos, aquí podrías mapearlos.
      // Por ahora, cuando viewingAll === true, dejamos sin filtro para traer todas.

      const { data: rawSeries, error: seriesError } = await seriesQuery;
      if (seriesError) throw seriesError;

      const normalizedSeries = (rawSeries ?? []).map((row: Record<string, any>) => {
        const sucursalId = row.sucursal_id != null ? String(row.sucursal_id) : row.sucursal ?? null;
        const nombre =
          row.sucursal_nombre ??
          row.nombre ??
          (sucursalId ? `Sucursal ${sucursalId.slice(0, 6)}…` : 'Sin sucursal');
        const ventas = Number(row.ventas_brutas ?? row.total_bruto ?? 0);
        const margen = Number(row.margen ?? row.margen_bruto ?? 0);
        const tickets = Number(row.tickets ?? row.transacciones ?? 0);
        const lineas = Number(row.lineas ?? row.line_items ?? 0);
        const cogs = Number(row.cogs ?? row.costo ?? 0);
        const itbms = Number(row.itbms ?? row.total_impuestos ?? row.impuesto ?? 0);

        return {
          dia: row.dia,
          fecha: row.dia ? formatDateDDMMYYYY(row.dia) : '',
          ventas,
          margen,
          tickets,
          lineas,
          cogs,
          itbms,
          sucursal_id: sucursalId,
          sucursal_nombre: nombre,
        };
      });

      // Agrupar por día (defensivo: ignorar filas sin `dia`)
      const seriesByDayMap = new Map<
        string,
        { dia: string; fecha: string; ventas: number; margen: number; tickets: number }
      >();
      normalizedSeries.forEach(row => {
        if (!row.dia) return;
        const entry =
          seriesByDayMap.get(row.dia) ?? { dia: row.dia, fecha: row.fecha, ventas: 0, margen: 0, tickets: 0 };
        entry.ventas += row.ventas;
        entry.margen += row.margen;
        entry.tickets += row.tickets;
        seriesByDayMap.set(row.dia, entry);
      });

      const seriesForChart = Array
        .from(seriesByDayMap.values())
        .filter(r => typeof r.dia === 'string' && r.dia.length > 0)
        .sort((a, b) => a.dia.localeCompare(b.dia));

      setSeriesData(seriesForChart);

      // Tabla por sucursal
      const sucursalMap = new Map<
        string,
        { nombre: string; ventas: number; transacciones: number }
      >();
      normalizedSeries.forEach(row => {
        const key = row.sucursal_id ?? row.sucursal_nombre ?? 'sin-id';
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

      // Totales (usar serie; si incluye hoy y existe v_ui_kpis_hoy, sobreescribir totals)
      const totalsFromSeries = normalizedSeries.reduce(
        (acc, row) => ({
          ventas: acc.ventas + row.ventas,
          tickets: acc.tickets + row.tickets,
          itbms: acc.itbms + row.itbms,
        }),
        { ventas: 0, tickets: 0, itbms: 0 }
      );

      let totals = totalsFromSeries;

      const incluyeHoy = desde <= hoy && hasta >= hoy;
      if (incluyeHoy) {
        let kpisQuery = supabase.from('v_ui_kpis_hoy').select('*');
        if (!viewingAll && filter.field && filter.value) {
          kpisQuery = kpisQuery.eq(filter.field, filter.value);
        }
        const { data: kpisHoy, error: kpisError } = await kpisQuery;
        if (!kpisError && Array.isArray(kpisHoy) && kpisHoy.length > 0) {
          totals = kpisHoy.reduce(
            (acc, row: any) => ({
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
        filtro: { desde, hasta, viewingAll, selectedSucursalId, selectedSucursalName, filter },
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
  }, [sucursales, desde, hasta, viewingAll, selectedSucursalId, selectedSucursalName, hoy]);

  // --------- Sync (igual que tenías) ---------
  const functionsBase = useMemo(() => getFunctionsBase(), []);
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
          if (!response.ok && response.status === 404) continue;
          resp = response;
          break;
        } catch (err) {
          throw err;
        }
      }
      if (!resp) throw new Error('No fue posible ejecutar la sincronización');
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
      } catch {}
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
      setSyncBanner({ when: new Date().toISOString(), stats: [], visible: true, kind: 'warn', message });
      debugLog('Sync Ventas (DB) error:', e);
    } finally {
      setSyncing(false);
    }
  }, [functionsBase, hoy, loadData]);

  // --------- Realtime & efectos ---------
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

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => {
      debugLog('[VentasPage] evento debug:refetch-all recibido');
      loadData();
    };
    window.addEventListener('debug:refetch-all', handler);
    return () => window.removeEventListener('debug:refetch-all', handler);
  }, [loadData]);

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
    // … (TU JSX DE RENDER SE QUEDA IGUAL)
    // No toqué nada visual; solo cambié la lógica de carga y filtros.
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* ...todo tu JSX actual... */}
    </div>
  );
}
