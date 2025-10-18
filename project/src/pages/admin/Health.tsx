import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, Server, ShieldAlert, Database } from 'lucide-react';
import { isSupabaseConfigured, pingSupabase, supabase } from '../../lib/supabase';
import {
  debugLog,
  formatFunctionsHost,
  getFunctionsBase,
  getProxyUrlForYesterday,
  isDebug,
  logEnv,
  yesterdayRange,
} from '../../utils/diagnostics';

interface SyncLogRow {
  created_at: string;
  recurso?: string | null;
  status?: string | null;
  detalles?: string | null;
}

type Status = 'pending' | 'ok' | 'fail';

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

export const AdminHealth = () => {
  const debugMode = isDebug();
  const [supabasePing, setSupabasePing] = useState<{ ok: boolean; status: number; note: string } | null>(null);
  const [proxyStatus, setProxyStatus] = useState<Status>(debugMode ? 'pending' : 'fail');
  const [proxyMessage, setProxyMessage] = useState<string>('En espera');
  const [lastSync, setLastSync] = useState<SyncLogRow | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [restStatuses, setRestStatuses] = useState<Record<string, { ok: boolean; status: number; note: string }>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const envData = useMemo(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    const functionsBase = getFunctionsBase();
    return {
      supabaseUrl,
      anonKey,
      functionsBase,
      functionsHost: formatFunctionsHost(),
    };
  }, []);

  useEffect(() => {
    if (!debugMode) return;
    logEnv();
    let mounted = true;

    if (!isSupabaseConfigured) {
      setSupabasePing({ ok: false, status: 0, note: 'Supabase no configurado' });
    } else {
      pingSupabase()
        .then(result => {
          if (!mounted) return;
          setSupabasePing(result);
        })
        .catch(err => {
          debugLog('[AdminHealth] pingSupabase error', err);
          if (mounted) setSupabasePing({ ok: false, status: 0, note: err instanceof Error ? err.message : 'Error inesperado' });
        });
    }

    const proxyUrl = getProxyUrlForYesterday();
    if (!proxyUrl) {
      setProxyStatus('fail');
      setProxyMessage('VITE_SUPABASE_FUNCTIONS_BASE no configurado');
    } else {
      fetch(proxyUrl, { method: 'GET', headers: { Accept: 'application/json' } })
        .then(async res => {
          const text = await res.text().catch(() => '');
          const sample = text.slice(0, 120);
          if (!mounted) return;
          if (res.ok) {
            setProxyStatus('ok');
            setProxyMessage(sample || 'JSON sin contenido');
          } else {
            setProxyStatus('fail');
            setProxyMessage(`HTTP ${res.status} ${sample}`);
          }
        })
        .catch(err => {
          if (!mounted) return;
          setProxyStatus('fail');
          setProxyMessage(err?.message || 'Error desconocido en fetch');
        });
    }

    const restBase = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    if (restBase && anonKey) {
      const endpoints = [
        { key: 'invu_ventas', label: 'invu_ventas' },
        { key: 'hr_periodo_totales', label: 'hr_periodo_totales' },
      ];

      Promise.all(endpoints.map(async ({ key, label }) => {
        const url = `${restBase}/rest/v1/${label}?select=count&limit=1`;
        try {
          const response = await fetch(url, {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
              Accept: 'application/json',
            },
          });
          const sample = await response.text().catch(() => '');
          debugLog('[AdminHealth] REST status', label, response.status, sample.slice(0, 120));
          return {
            key,
            value: {
              ok: response.ok,
              status: response.status,
              note: sample.slice(0, 120) || 'Respuesta sin cuerpo',
            },
          };
        } catch (err) {
          debugLog('[AdminHealth] REST error', label, err);
          return {
            key,
            value: {
              ok: false,
              status: 0,
              note: err instanceof Error ? err.message : 'Error desconocido',
            },
          };
        }
      }))
        .then(results => {
          if (!mounted) return;
          setRestStatuses(prev => {
            const next = { ...prev };
            results.forEach(({ key, value }) => {
              next[key] = value;
            });
            return next;
          });
        });
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
          setSyncError('No fue posible leer sync_log (ver consola en debug).');
          debugLog('[AdminHealth] sync_log error', err);
        }
      }
    };

    loadSyncLog();

    return () => {
      mounted = false;
    };
  }, [debugMode]);

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

    const { desde } = yesterdayRange();
    const query = `?desde=${desde}&hasta=${desde}`;
    const endpoints = [
      `${functionsBase}/sync-ventas-v4${query}`,
      `${functionsBase}/sync-ventas${query}`,
    ];

    setSyncing(true);
    setSyncNote(null);

    const runEndpoint = async (endpoint: string) => {
      const execute = async (retry: boolean): Promise<{ data: any; status: number }> => {
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
          debugLog('[AdminHealth] sync retry por status', response.status);
          return execute(false);
        }

        const error: any = new Error(`HTTP ${response.status}${body ? ` · ${body.slice(0, 120)}` : ''}`);
        error.status = response.status;
        throw error;
      };

      return execute(true);
    };

    try {
      let result: any = null;
      for (const endpoint of endpoints) {
        try {
          const { data } = await runEndpoint(endpoint);
          result = data;
          break;
        } catch (err: any) {
          if (err?.status === 404 && endpoint.includes('sync-ventas-v4')) {
            debugLog('[AdminHealth] sync-ventas-v4 no disponible, probando sync-ventas');
            continue;
          }
          throw err;
        }
      }

      if (!result) {
        throw new Error('Sincronización no disponible');
      }

      setSyncNote('Sincronización ejecutada correctamente.');
      debugLog('[AdminHealth] sync result', result);
      handleRefetchAll();
    } catch (err: any) {
      setSyncNote(err instanceof Error ? err.message : 'Error al ejecutar la sincronización');
      debugLog('[AdminHealth] sync error', err);
    } finally {
      setSyncing(false);
    }
  };

  if (!debugMode) {
    return null;
  }

  const proxyUrl = getProxyUrlForYesterday();
  const { desde } = yesterdayRange();
  const supabaseStatus: Status = supabasePing ? (supabasePing.ok ? 'ok' : 'fail') : 'pending';
  const inVUStatus = restStatuses['invu_ventas'];
  const hrStatus = restStatuses['hr_periodo_totales'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Panel de Diagnóstico</h2>
          <p className="text-sm text-gray-600">Visión rápida del entorno y conectividad (solo debug)</p>
        </div>
        <button
          onClick={handleSyncVentas}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
        >
          <RefreshCw className="w-4 h-4" />
          {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>
      {syncNote && (
        <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
          {syncNote}
        </div>
      )}
      <button
        onClick={handleRefetchAll}
        className="text-xs text-blue-600 hover:text-blue-700"
      >
        Forzar refetch de dashboards
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <Server className="w-4 h-4" />
            Supabase
          </h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div>{statusBadge(supabaseStatus, supabaseStatus === 'ok' ? 'Ping ok' : supabaseStatus === 'pending' ? 'Ping pendiente' : 'Ping falló')}</div>
            <div>URL: {maskEnv(envData.supabaseUrl)}</div>
            <div>Anon Key: {maskEnv(envData.anonKey)}</div>
            {supabasePing && (
              <div className="text-xs text-gray-500">Nota: {supabasePing.note} (status {supabasePing.status || 'n/a'})</div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <Server className="w-4 h-4" />
            Edge Function INVU
          </h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div>{statusBadge(proxyStatus, proxyStatus === 'ok' ? 'Proxy ok' : proxyStatus === 'pending' ? 'Revisando…' : 'Proxy con fallas')}</div>
            <div>Host: {envData.functionsHost}</div>
            <div className="break-all text-xs text-gray-500">URL prueba: {proxyUrl || '—'}</div>
            <div className="text-xs text-gray-500">Resultado: {proxyMessage}</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Database className="w-4 h-4" />
          Tablas / Vistas críticas (REST)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div className="border border-gray-100 rounded-xl p-4">
            <div className="font-semibold mb-1">invu_ventas</div>
            {inVUStatus ? (
              <div className="text-xs text-gray-500">
                Status {inVUStatus.status} — {inVUStatus.ok ? 'OK' : 'Error'}
                <br />
                {inVUStatus.note}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Consultando…</div>
            )}
          </div>
          <div className="border border-gray-100 rounded-xl p-4">
            <div className="font-semibold mb-1">hr_periodo_totales</div>
            {hrStatus ? (
              <div className="text-xs text-gray-500">
                Status {hrStatus.status} — {hrStatus.ok ? 'OK' : 'Error'}
                <br />
                {hrStatus.note}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Consultando…</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Última sincronización</h3>
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
          <li>El rango usado para el proxy INVU es el día de ayer ({desde}) en horario Panamá (UTC-5).</li>
          <li>Usa ?debug=1 en la URL para mantener este panel accesible.</li>
          <li>El botón de sincronización dispara un evento global para que Dashboard y Ventas vuelvan a cargar datos.</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminHealth;
