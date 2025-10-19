import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Activity } from 'lucide-react';
import { getFunctionsBase, isDebug, yesterdayUTC5Range, debugLog } from '../../utils/diagnostics';
import { InvuBranch } from '../../services/invu_marcaciones';

type BranchCheck = {
  branch: InvuBranch;
  label: string;
};

type BranchResult = {
  branch: string;
  status: number;
  ok: boolean;
  count: number;
  sample?: string;
  note?: string;
};

const BRANCHES: BranchCheck[] = [
  { branch: 'sf', label: 'San Francisco' },
  { branch: 'museo', label: 'Museo del Canal' },
  { branch: 'cangrejo', label: 'El Cangrejo' },
  { branch: 'costa', label: 'Costa del Este' },
  { branch: 'central', label: 'Central' },
];

export const AdminHealthInvu = () => {
  const debugMode = isDebug();
  const [results, setResults] = useState<BranchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const functionsBase = useMemo(() => getFunctionsBase(), []);
  const testDate = useMemo(() => yesterdayUTC5Range().desde, []);

  const runChecks = useCallback(async () => {
    if (!functionsBase) {
      setError('Edge Functions base no configurada (VITE_SUPABASE_FUNCTIONS_BASE o VITE_SUPABASE_URL).');
      setResults([]);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const checks: BranchResult[] = [];
      for (const branch of BRANCHES) {
        const url = `${functionsBase}/invu-marcaciones?branch=${branch.branch}&date=${testDate}`;
        try {
          const response = await fetch(url, { headers: { Accept: 'application/json' } });
          const status = response.status;
          let payload: any = null;

          try {
            payload = await response.json();
          } catch {
            payload = null;
          }

          const ok = response.ok && payload?.ok !== false;
          const dataArray = Array.isArray(payload?.data) ? payload.data : [];
          const count = typeof payload?.count === 'number' ? payload.count : dataArray.length;
          const sample = dataArray.length > 0 ? JSON.stringify(dataArray[0]).slice(0, 160) : undefined;
          const note = payload?.error
            ? String(payload.error)
            : !ok
              ? payload?.detail ? JSON.stringify(payload.detail).slice(0, 160) : 'Respuesta no exitosa.'
              : undefined;

          checks.push({
            branch: branch.label,
            status,
            ok,
            count,
            sample,
            note,
          });
        } catch (err) {
          checks.push({
            branch: branch.label,
            status: 0,
            ok: false,
            count: 0,
            sample: undefined,
            note: err instanceof Error ? err.message : String(err),
          });
        }
      }

      setResults(checks);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      debugLog('[HealthInvu] runChecks error', err);
      setError(err instanceof Error ? err.message : 'Error desconocido al consultar marcaciones.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [functionsBase, testDate]);

  useEffect(() => {
    if (debugMode) {
      runChecks();
    }
  }, [debugMode, runChecks]);

  const handleRefetchAll = () => {
    window.dispatchEvent(new CustomEvent('debug:refetch-all'));
  };

  if (!debugMode) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Panel disponible solo con <code>?debug=1</code>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Health INVU - Marcaciones oficiales</h2>
          <p className="text-sm text-gray-600">
            Ejecuta la función Edge de marcaciones oficiales para cada sucursal usando tokens configurados en Supabase.
          </p>
          <p className="text-xs text-gray-500 mt-1">Fecha de prueba (PTY): {testDate}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={runChecks}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Verificando…' : 'Re-ejecutar checks'}
          </button>
          <button
            onClick={handleRefetchAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition"
          >
            <Activity className="w-4 h-4" />
            Refrescar dashboards
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          {error}
        </div>
      )}

      {lastUpdated && (
        <div className="text-xs text-gray-500">
          Última ejecución: {new Date(lastUpdated).toLocaleString('es-PA')}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Sucursal</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">OK</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Marcaciones</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Sample</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Nota</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {results.map(result => (
              <tr key={result.branch}>
                <td className="px-4 py-3 text-gray-900">{result.branch}</td>
                <td className="px-4 py-3 text-gray-600">{result.status || '—'}</td>
                <td className={`px-4 py-3 ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
                  {result.ok ? 'Sí' : 'No'}
                </td>
                <td className="px-4 py-3 text-gray-600">{result.count}</td>
                <td className="px-4 py-3 text-gray-500">
                  {result.sample ? <code className="text-xs break-all">{result.sample}</code> : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {result.note ? <span className="text-xs break-all">{result.note}</span> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminHealthInvu;
