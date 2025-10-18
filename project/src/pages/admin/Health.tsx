import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, Server, ShieldAlert, Database, Activity } from 'lucide-react';
import { isSupabaseConfigured, pingSupabase, supabase } from '../../lib/supabase';
import {
  debugLog,
  formatFunctionsHost,
  getFunctionsBase,
  getProxyUrlForYesterday,
  isDebug,
  logEnv,
  rest,
  yesterdayUTC5Range,
} from '../../utils/diagnostics';

type Status = 'pending' | 'ok' | 'fail';

type CheckResult = {
  ok: boolean;
  status: number;
  note: string;
};

interface SyncLogRow {
  created_at: string;
  recurso?: string | null;
  status?: string | null;
  detalles?: string | null;
}

const statusBadge = (status: Status, label: string) => {
  const map = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    ok: 'bg-green-100 text-green-800 border-green-200',
    fail: 'bg-red-100 text-red-800 border-red-200',
  } as const;
  const Icon = status === 'ok' ? CheckCircle : status === 'fail' ? ShieldAlert : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full border ${map[status]}`}>
      <Icon className="w-4 h-4" />
      {label}
    </span>
  );
};

const maskEnv = (value: string | undefined) => {
  if (!value) return '—';
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
};

const evaluateResponse = async (response: Response): Promise<CheckResult> => {
  const text = await response.text().catch(() => '');
  return {
    ok: response.ok,
    status: response.status,
    note: text.slice(0, 200) || 'Respuesta sin cuerpo',
  };
};

const resolveError = (err: unknown): CheckResult => ({
  ok: false,
  status: 0,
  note: err instanceof Error ? err.message : 'Error desconocido',
});

export const AdminHealth = () => {
  const debugMode = isDebug();
  const [supabasePing, setSupabasePing] = useState<CheckResult | null>(null);
  const [restChecks, setRestChecks] = useState<Record<string, CheckResult>>({});
  const [edgeChecks, setEdgeChecks] = useState<Record<string, CheckResult>>({});
  const [attendanceCheck, setAttendanceCheck] = useState<CheckResult | null>(null);
  const [lastSync, setLastSync] = useState<SyncLogRow | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const envData = useMemo(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    const functionsBase = getFunctionsBase();
    const restBase = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/rest/v1` : '';
    return {
      supabaseUrl,
      anonKey,
      functionsBase,
      restBase,
      functionsHost: formatFunctionsHost(),
    };
  }, []);

  useEffect(() => {
    if (!debugMode) return;
    logEnv();
    let mounted = true;

    const setIfMounted = <T,>(setter: (value: T) => void) => (value: T) => {
      if (mounted) setter(value);
    };

    if (!isSupabaseConfigured) {
      setSupabasePing({ ok: false, status: 0, note: 'Supabase no está configurado' });
    } else {
      pingSupabase()
        .then(result => setIfMounted(setSupabasePing)(result))
        .catch(err => {
          debugLog('[AdminHealth] pingSupabase error', err);
          setIfMounted(setSupabasePing)(resolveError(err));
        });
    }

    const { restBase, anonKey, functionsBase } = envData;
    const { desde } = yesterdayUTC5Range();

    if (restBase && anonKey) {
      const restEndpoints = [
        { key: 'kpis', url: `${restBase}/v_ui_kpis_hoy?select=*`, label: 'v_ui_kpis_hoy' },
        { key: 'series', url: `${restBase}/v_ui_series_14d?select=*`, label: 'v_ui_series_14d' },
      ];

      Promise.all(
        restEndpoints.map(async ({ key, url, label }) => {
          try {
            const response = await rest(url, anonKey);
            const result = await evaluateResponse(response);
            debugLog('[AdminHealth] REST', label, result.status, result.note);
            return { key, result };
          } catch (err) {
            debugLog('[AdminHealth] REST error', label, err);
            return { key, result: resolveError(err) };
          }
        })
      ).then(results => {
        if (!mounted) return;
        setRestChecks(prev => {
          const next = { ...prev };
          results.forEach(({ key, result }) => {
            next[key] = result;
          });
          return next;
        });
      });
    } else {
      if (anonKey == null || envData.supabaseUrl == null) {
        setRestChecks({
          kpis: { ok: false, status: 0, note: 'Variables VITE_SUPABASE_URL/ANON_KEY faltantes' },
          series: { ok: false, status: 0, note: 'Variables VITE_SUPABASE_URL/ANON_KEY faltantes' },
        });
      }
    }

    if (functionsBase) {
      const attendanceUrl = getProxyUrlForYesterday();
      if (attendanceUrl) {
        fetch(attendanceUrl, { headers: { Accept: 'application/json' } })
          .then(evaluateResponse)
          .then(setIfMounted(setAttendanceCheck))
          .catch(err => setIfMounted(setAttendanceCheck)(resolveError(err)));
      } else {
        setAttendanceCheck({ ok: false, status: 0, note: 'Proxy INVU no configurado' });
      }

      const ordersUrl = `${functionsBase}/invu-orders?branch=sf&from=${desde}&to=${desde}`;
      fetch(ordersUrl, { headers: { Accept: 'application/json' } })
        .then(evaluateResponse)
        .then(result => {
          if (!mounted) return;
          setEdgeChecks(prev => ({ ...prev, orders: result }));
        })
        .catch(err => {
          if (!mounted) return;
          setEdgeChecks(prev => ({ ...prev, orders: resolveError(err) }));
        });

      const syncUrl = `${functionsBase}/sync-ventas-detalle?desde=${desde}&hasta=${desde}`;
      fetch(syncUrl, { method: 'POST', headers: { Accept: 'application/json' } })
        .then(evaluateResponse)
        .then(result => {
          if (!mounted) return;
          setEdgeChecks(prev => ({ ...prev, sync: result }));
        })
        .catch(err => {
          if (!mounted) return;
          setEdgeChecks(prev => ({ ...prev, sync: resolveError(err) }));
        });
    } else {
      setEdgeChecks({
        orders: { ok: false, status: 0, note: 'Falta VITE_SUPABASE_FUNCTIONS_BASE' },
        sync: { ok: false, status: 0, note: 'Falta VITE_SUPABASE_FUNCTIONS_BASE' },
      });
      setAttendanceCheck({ ok: false, status: 0, note: 'Falta VITE_SUPABASE_FUNCTIONS_BASE' });
    }

    const loadSyncLog = async () => {
      if (!isSupabaseConfigured) {
        setSyncError('Supabase no está configurado en este entorno.');
        return;
      }

      try {
        const { data, error } = await supabase
          .from<SyncLogRow>('sync_log')
          .select('created_at,recurso,status,detalles')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        if (mounted) setLastSync(data?.[0] ?? null);
      } catch (err) {
        if (mounted) {
          setSyncError('No fue posible leer sync_log (revisa consola en debug).');
          debugLog('[AdminHealth] sync_log error', err);
        }
      }
    };

    loadSyncLog();

    return () => {
      mounted = false;
    };
  }, [debugMode, envData]);

  const handleRefetchAll = () => {
    if (!debugMode) return;
    window.dispatchEvent(new CustomEvent('debug:refetch-all'));
  };

  const handleSyncVentas = async () => {
    if (!debugMode) return;
    const functionsBase = envData.functionsBase;
    if (!functionsBase) {
      setSyncNote('Edge Function no configurada (VITE_SUPABASE_FUNCTIONS_BASE)');
      return;
    }

    const { desde } = yesterdayUTC5Range();
    const query = `?desde=${desde}&hasta=${desde}`;
    const endpoints = [
      `${functionsBase}/sync-ventas-detalle${query}`,
      `${functionsBase}/sync-ventas-v4${query}`,
      `${functionsBase}/sync-ventas${query}`,
    ];

    setSyncing(true);
    setSyncNote(null);

    const runEndpoint = async (endpoint: string) => {
      const execute = async (retry: boolean): Promise<CheckResult> => {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            return evaluateResponse(response);
          }

          if (response.status >= 500 && retry) {
            debugLog('[AdminHealth] sync retry por status', response.status);
            return execute(false);
          }

          const error = await evaluateResponse(response);
          throw error;
        } catch (err) {
          if (err && typeof err === 'object' && 'status' in err) {
            throw err;
          }
          throw resolveError(err);
        }
      };

      return execute(true);
    };

    try {
      let result: CheckResult | null = null;

      for (const endpoint of endpoints) {
        try {
          result = await runEndpoint(endpoint);
          break;
        } catch (err: any) {
          if (err.status === 404 && endpoint.includes('sync-ventas-detalle')) {
            debugLog('[AdminHealth] sync-ventas-detalle no disponible, probando fallback');
            continue;
          }
          if (err.status === 404 && endpoint.includes('sync-ventas-v4')) {
            debugLog('[AdminHealth] sync-ventas-v4 no disponible, probando sync-ventas');
            continue;
          }
          throw err;
        }
      }

      if (!result) {
        throw new Error('No fue posible ejecutar la sincronización');
      }

      setSyncNote('Sincronización ejecutada correctamente.');
      setEdgeChecks(prev => ({ ...prev, sync: result }));
      handleRefetchAll();
    } catch (err) {
      const error = err && typeof err === 'object' && 'note' in err ? (err as CheckResult) : resolveError(err);
      setSyncNote(error.note);
      setEdgeChecks(prev => ({ ...prev, sync: error }));
      debugLog('[AdminHealth] sync error', err);
    } finally {
      setSyncing(false);
    }
  };

  if (!debugMode) {
    return null;
  }

  const supabaseStatus: Status = supabasePing ? (supabasePing.ok ? 'ok' : 'fail') : 'pending';
  const restKpis = restChecks.kpis;
  const restSeries = restChecks.series;
  const edgeOrders = edgeChecks.orders;
  const edgeSync = edgeChecks.sync;
  const attendanceResult = attendanceCheck;
  const functionsHost = envData.functionsHost;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Panel de Diagnóstico</h2>
          <p className="text-sm text-gray-600">Visión rápida del entorno y conectividad (solo debug)</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSyncVentas}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
          <button
            onClick={handleRefetchAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 transition"
          >
            <Activity className="w-4 h-4" />
            Refrescar dashboards
          </button>
        </div>
      </div>

      {syncNote && (
        <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
          {syncNote}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-2 text-sm text-gray-600">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Server className="w-4 h-4" /> Supabase</h3>
          <div>{statusBadge(supabaseStatus, supabaseStatus === 'ok' ? 'Ping ok' : supabaseStatus === 'pending' ? 'Ping pendiente' : 'Ping falló')}</div>
          <div>URL: {maskEnv(envData.supabaseUrl)}</div>
          <div>Anon Key: {maskEnv(envData.anonKey)}</div>
          {supabasePing && (
            <div className="text-xs text-gray-500">Nota: {supabasePing.note} (status {supabasePing.status || 'n/a'})</div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3 text-sm text-gray-600">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Database className="w-4 h-4" /> REST checks</h3>
          <div>
            <div className="font-semibold">v_ui_kpis_hoy</div>
            <div className="text-xs text-gray-500">
              {restKpis ? `Status ${restKpis.status} — ${restKpis.ok ? 'OK' : 'Error'} · ${restKpis.note}` : 'Consultando…'}
            </div>
          </div>
          <div>
            <div className="font-semibold">v_ui_series_14d</div>
            <div className="text-xs text-gray-500">
              {restSeries ? `Status ${restSeries.status} — ${restSeries.ok ? 'OK' : 'Error'} · ${restSeries.note}` : 'Consultando…'}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3 text-sm text-gray-600">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Server className="w-4 h-4" /> Edge Functions</h3>
          <div className="text-xs text-gray-500">Host: {functionsHost}</div>
          <div>
            <div className="font-semibold">invu-orders (GET)</div>
            <div className="text-xs text-gray-500">
              {edgeOrders ? `Status ${edgeOrders.status} — ${edgeOrders.ok ? 'OK' : 'Error'} · ${edgeOrders.note}` : 'Consultando…'}
            </div>
          </div>
          <div>
            <div className="font-semibold">sync-ventas-detalle (POST)</div>
            <div className="text-xs text-gray-500">
              {edgeSync ? `Status ${edgeSync.status} — ${edgeSync.ok ? 'OK' : 'Error'} · ${edgeSync.note}` : 'Consultando…'}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-2 text-sm text-gray-600">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Database className="w-4 h-4" /> INVU attendance proxy</h3>
          <div>
            {attendanceResult
              ? `Status ${attendanceResult.status} — ${attendanceResult.ok ? 'OK' : 'Error'} · ${attendanceResult.note}`
              : 'Consultando…'}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Última sincronización registrada</h3>
        {lastSync ? (
          <div className="text-sm text-gray-700 space-y-1">
            <div><strong>Fecha:</strong> {new Date(lastSync.created_at).toLocaleString('es-PA')}</div>
            <div><strong>Recurso:</strong> {lastSync.recurso ?? '—'}</div>
            <div><strong>Estado:</strong> {lastSync.status ?? '—'}</div>
            {lastSync.detalles && <div className="text-xs text-gray-500 break-all">{lastSync.detalles}</div>}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No se encontraron registros en sync_log.</p>
        )}
        {syncError && <p className="mt-2 text-xs text-red-600">{syncError}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Notas</h3>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
          <li>REST checks usan el rol anon para consultar v_ui_kpis_hoy y v_ui_series_14d.</li>
          <li>Las funciones Edge se prueban con invu-orders (GET) y sync-ventas-detalle (POST) para el día de ayer.</li>
          <li>El botón “Sincronizar ahora” ejecuta sync-ventas-detalle y luego dispara un refetch global.</li>
          <li>“Refrescar dashboards” emite el evento <code>debug:refetch-all</code> sin ejecutar sincronización.</li>
          <li>El proxy de asistencia sigue activo mediante invu-attendance-proxy.</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminHealth;
