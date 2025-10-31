import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PieChart as PieChartIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { formatCurrencyUSD } from '../../lib/format';
import {
  formatDateIso,
  rpcWithFallback,
  toNumber,
  type RpcParams,
} from './rpcHelpers';

interface BalanceRawRow {
  mes?: string;
  periodo?: string;
  sucursal_id?: string | null;
  sucursalId?: string | null;
  type?: string;
  tipo?: string;
  balance?: number | string | null;
  monto?: number | string | null;
}

interface BalanceRow {
  mes: string;
  sucursalId: string | null;
  type: string;
  balance: number;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Error desconocido';
};

const buildVariants = (
  mes: string,
  sucursalId: string | null
): RpcParams[] => [
  { p_mes: mes, p_sucursal_id: sucursalId },
  { mes, p_sucursal_id: sucursalId },
  { mes, sucursal_id: sucursalId },
  { p_mes: mes, sucursal_id: sucursalId },
  { mes, sucursalId },
];

const COLORS: Record<string, string> = {
  activo: '#2563eb',
  pasivo: '#dc2626',
  capital: '#059669',
  patrimonio: '#7c3aed',
  otros: '#0f172a',
};

const normalize = (rows: BalanceRawRow[]): BalanceRow[] =>
  rows.map((row) => {
    const mes = row.mes || row.periodo || '';
    const sucursalId =
      (row.sucursal_id ?? row.sucursalId ?? null) !== undefined
        ? (row.sucursal_id ?? row.sucursalId ?? null)
        : null;
    const type = (row.type || row.tipo || 'otros').toString().toLowerCase();
    const balance = toNumber(row.balance ?? row.monto);
    return {
      mes: mes ? mes.slice(0, 10) : '',
      sucursalId: sucursalId ? String(sucursalId) : null,
      type,
      balance,
    };
  });

export const BalancePage = () => {
  const { sucursales, sucursalSeleccionada } = useAuthOrg();
  const [mes, setMes] = useState('');
  const [selectedSucursal, setSelectedSucursal] = useState('');
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    setMes(ym);
  }, []);

  useEffect(() => {
    if (sucursalSeleccionada?.id) {
      setSelectedSucursal(String(sucursalSeleccionada.id));
    }
  }, [sucursalSeleccionada?.id]);

  const fetchData = useCallback(async () => {
    if (!mes) return;
    setLoading(true);
    setError(null);
    try {
      const filterMes = `${mes}-01`;
      const sucursalId = selectedSucursal || null;
      const data =
        (await rpcWithFallback<BalanceRawRow[]>(
          'api_get_balance',
          buildVariants(filterMes, sucursalId)
        )) ?? [];
      setRows(normalize(data));
    } catch (err: unknown) {
      console.error('Error cargando api_get_balance', err);
      setRows([]);
      setError(getErrorMessage(err) ?? 'No fue posible obtener el balance general.');
    } finally {
      setLoading(false);
    }
  }, [mes, selectedSucursal]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const key = row.type || 'otros';
      map.set(key, (map.get(key) ?? 0) + row.balance);
    }
    return Array.from(map.entries()).map(([type, balance]) => ({ type, balance }));
  }, [rows]);

  const totalBalance = useMemo(
    () => totals.reduce((acc, row) => acc + row.balance, 0),
    [totals]
  );

  const chartData = useMemo(
    () =>
      totals.map((item) => ({
        name: item.type.charAt(0).toUpperCase() + item.type.slice(1),
        value: item.balance,
      })),
    [totals]
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-bean">Balance General</h1>
          <p className="text-slate7g">
            Distribución de activos, pasivos y patrimonio por sucursal y mes.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Mes
            <input
              type="month"
              value={mes}
              onChange={(event) => setMes(event.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            />
          </label>
          <label className="md:col-span-2 flex flex-col gap-2 text-sm text-slate7g">
            Sucursal
            <select
              value={selectedSucursal}
              onChange={(event) => setSelectedSucursal(event.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            >
              <option value="">Todas mis sucursales</option>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={fetchData}
              className="w-full rounded-xl border border-sand px-4 py-2 text-sm text-bean hover:border-bean"
            >
              Actualizar
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-sand bg-white shadow-sm">
        <header className="flex items-center gap-3 border-b border-sand px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bean/10 text-bean">
            <PieChartIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Composición del balance</h2>
            <p className="text-sm text-slate-500">
              {mes ? `Mes ${formatDateIso(`${mes}-01`)}` : 'Selecciona un mes'}
            </p>
          </div>
        </header>
        <div className="grid gap-6 p-6 lg:grid-cols-2">
          <div className="min-h-[280px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.name}: ${formatCurrencyUSD(entry.value)}`}
                  >
                    {chartData.map((entry, index) => {
                      const colorKey = entry.name.toLowerCase();
                      const fill = COLORS[colorKey] ?? COLORS.otros;
                      return <Cell key={`cell-${index}`} fill={fill} />;
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrencyUSD(value),
                      name,
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-sm text-slate-500">
                <Loader2 className="mb-2 h-4 w-4 animate-spin" />
                Sin datos para graficar.
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-sand text-sm">
              <thead className="bg-off/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-right">Porcentaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand/70">
                {totals.map((row) => {
                  const pct = totalBalance === 0 ? 0 : (row.balance / totalBalance) * 100;
                  const label = row.type.charAt(0).toUpperCase() + row.type.slice(1);
                  return (
                    <tr key={row.type}>
                      <td className="px-4 py-3 font-medium text-slate-700">{label}</td>
                      <td className="px-4 py-3 text-right font-mono text-base">
                        {formatCurrencyUSD(row.balance)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-500">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 pb-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando balance…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="px-4 pb-6 text-center text-sm text-slate-500">
            No hay balances registrados para el mes seleccionado.
          </div>
        )}
        {error && (
          <div className="px-4 pb-6 text-center text-sm text-rose-600">{error}</div>
        )}
      </section>
    </div>
  );
};

export default BalancePage;
