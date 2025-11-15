import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, PieChart as PieChartIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { formatCurrencyUSD } from '../../lib/format';
import { formatDateIso } from './rpcHelpers';
import { exportToCsv, exportToXlsx, formatNumber } from './exportUtils';
import {
  fetchAccountCatalog,
  fetchJournalsInRange,
  fetchMonthlyPnl,
  getMonthBounds,
  getMonthSequence,
  monthKeyFromDate,
  normalizeAccountType,
  type AccountCatalogEntry,
  type MonthlyPnlResult,
} from './glData';

interface BalanceRow {
  mes: string;
  sucursalId: string | null;
  type: 'activos' | 'pasivos' | 'patrimonio';
  balance: number;
}

interface BalanceHistoryPoint {
  mes: string;
  activos: number;
  pasivos: number;
  patrimonio: number;
}

const COLORS: Record<string, string> = {
  activos: '#2563eb',
  pasivos: '#dc2626',
  patrimonio: '#059669',
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Error desconocido';
};

const ASSET_TYPES = new Set(['asset', 'assets', 'activo', 'activos', 'current_asset', 'noncurrent_asset']);
const LIABILITY_TYPES = new Set(['liability', 'liabilities', 'pasivo', 'pasivos']);
const EQUITY_TYPES = new Set(['equity', 'patrimonio', 'capital', 'capital_social']);
interface MonthAccumulator {
  activos: number;
  pasivos: number;
  equity: number;
}

const ensureAccumulator = (map: Map<string, MonthAccumulator>, key: string) => {
  if (!map.has(key)) {
    map.set(key, {
      activos: 0,
      pasivos: 0,
      equity: 0,
    });
  }
  return map.get(key)!;
};

const computeBalanceAggregates = (
  monthKeys: string[],
  journals: Awaited<ReturnType<typeof fetchJournalsInRange>>,
  catalog: Record<string, AccountCatalogEntry>,
  sucursalId: string | null,
  pnlByMonth: Record<string, MonthlyPnlResult>
): { rows: BalanceRow[]; history: BalanceHistoryPoint[] } => {
  const accumulator = new Map<string, MonthAccumulator>();
  monthKeys.forEach((month) => {
    ensureAccumulator(accumulator, month);
  });

  journals.forEach((journal) => {
    const monthKey = monthKeyFromDate(journal.journal_date);
    const bucket = accumulator.get(monthKey);
    if (!bucket) return;

    journal.lines.forEach((line) => {
      const account = catalog[line.account_id ?? ''];
      const type = normalizeAccountType(account?.type);
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;
      if (ASSET_TYPES.has(type)) {
        bucket.activos += debit - credit;
      } else if (LIABILITY_TYPES.has(type)) {
        bucket.pasivos += credit - debit;
      } else if (EQUITY_TYPES.has(type)) {
        bucket.equity += credit - debit;
      }
    });
  });

  const emptyPnl: MonthlyPnlResult = { ingresos: 0, cogs: 0, gastos: 0, utilidad: 0 };

  const history = monthKeys.map<BalanceHistoryPoint>((month) => {
    const bucket = ensureAccumulator(accumulator, month);
    const pnl = pnlByMonth[month] ?? emptyPnl;
    const patrimonio = bucket.equity + pnl.ingresos - pnl.gastos - pnl.cogs;
    return {
      mes: month,
      activos: bucket.activos,
      pasivos: bucket.pasivos,
      patrimonio,
    };
  });

  const selectedMonth = monthKeys[monthKeys.length - 1];
  const selectedBucket = ensureAccumulator(accumulator, selectedMonth);
  const selectedPnl = pnlByMonth[selectedMonth] ?? emptyPnl;
  const patrimonioActual =
    selectedBucket.equity + selectedPnl.ingresos - selectedPnl.gastos - selectedPnl.cogs;

  const rows: BalanceRow[] = [
    { mes: selectedMonth, sucursalId, type: 'activos', balance: selectedBucket.activos },
    { mes: selectedMonth, sucursalId, type: 'pasivos', balance: selectedBucket.pasivos },
    { mes: selectedMonth, sucursalId, type: 'patrimonio', balance: patrimonioActual },
  ];

  return { rows, history };
};

export const BalancePage = () => {
  const { sucursales, sucursalSeleccionada } = useAuthOrg();
  const [mes, setMes] = useState('');
  const [selectedSucursal, setSelectedSucursal] = useState('');
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [historyTotals, setHistoryTotals] = useState<BalanceHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Record<string, AccountCatalogEntry>>({});

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

  const ensureCatalog = useCallback(async () => {
    if (Object.keys(catalog).length > 0) return catalog;
    const data = await fetchAccountCatalog();
    setCatalog(data);
    return data;
  }, [catalog]);

  const fetchData = useCallback(async () => {
    if (!mes) return;
    setLoading(true);
    setError(null);
    try {
      const filterMes = `${mes}-01`;
      const sucursalId = selectedSucursal || null;
      const historyMonths = getMonthSequence(filterMes, 6);
      if (historyMonths.length === 0) {
        setRows([]);
        setHistoryTotals([]);
        setError('Mes inválido');
        setLoading(false);
        return;
      }

      const historyStart = historyMonths[0];
      const { end: historyEnd } = getMonthBounds(historyMonths[historyMonths.length - 1]);

      const [catalogData, journals, pnlResults] = await Promise.all([
        ensureCatalog(),
        fetchJournalsInRange({ from: historyStart, to: historyEnd, sucursalId }),
        Promise.all(historyMonths.map((month) => fetchMonthlyPnl({ month, sucursalId }))),
      ]);

      const pnlByMonth = historyMonths.reduce<Record<string, MonthlyPnlResult>>(
        (acc, month, index) => {
          const value = pnlResults[index];
          acc[month] = value ?? { ingresos: 0, cogs: 0, gastos: 0, utilidad: 0 };
          return acc;
        },
        {}
      );

      const { rows: monthRows, history } = computeBalanceAggregates(
        historyMonths,
        journals,
        catalogData,
        sucursalId,
        pnlByMonth
      );

      const currentRow = monthRows.filter((row) => row.mes === filterMes);
      const currentPnl = pnlByMonth[filterMes] ?? { ingresos: 0, cogs: 0, gastos: 0, utilidad: 0 };
      const hasData =
        journals.some((journal) => monthKeyFromDate(journal.journal_date) === filterMes) ||
        currentRow.some((row) => Math.abs(row.balance) > 0.0001) ||
        Math.abs(currentPnl.ingresos) > 0.0001 ||
        Math.abs(currentPnl.cogs) > 0.0001 ||
        Math.abs(currentPnl.gastos) > 0.0001;

      setRows(hasData ? monthRows : []);
      setHistoryTotals(history);
    } catch (err: unknown) {
      console.error('Error cargando Balance', err);
      setRows([]);
      setHistoryTotals([]);
      setError(getErrorMessage(err) ?? 'No fue posible obtener el balance general.');
    } finally {
      setLoading(false);
    }
  }, [ensureCatalog, mes, selectedSucursal]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totals = useMemo(() => rows, [rows]);

  const totalBalance = useMemo(
    () => totals.reduce((acc, row) => acc + row.balance, 0),
    [totals]
  );

  const chartData = useMemo(
    () =>
      totals.map((item) => ({
        name: item.type.charAt(0).toUpperCase() + item.type.slice(1),
        value: item.balance,
        key: item.type,
      })),
    [totals]
  );

  const historyChartData = useMemo(() => {
    return historyTotals
      .map((historySet) => ({
        mes: formatDateIso(historySet.mes),
        balance: historySet.activos,
      }))
      .filter((row) => row.mes);
  }, [historyTotals]);

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    const csvRows = rows.map((row) => [
      row.mes,
      row.sucursalId ?? 'Todas',
      row.type,
      formatNumber(row.balance),
    ]);
    exportToCsv(csvRows, ['Mes', 'Sucursal', 'Tipo', 'Balance'], { suffix: 'balance' });
  };

  const handleExportXlsx = () => {
    if (rows.length === 0) return;
    const data = rows.map((row) => ({
      Mes: row.mes,
      Sucursal: row.sucursalId ?? 'Todas',
      Tipo: row.type,
      Balance: row.balance,
    }));
    exportToXlsx(data, 'Balance', { suffix: 'balance' });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-bean">Balance General</h1>
          <p className="text-slate7g">
            Distribución de activos, pasivos y patrimonio por sucursal y mes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportXlsx}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-bean px-4 py-2 text-white shadow disabled:opacity-60"
          >
            <FileSpreadsheet size={16} /> Exportar XLSX
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-sand px-4 py-2 text-sm text-bean shadow-sm disabled:opacity-60"
          >
            <Download size={16} /> CSV
          </button>
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
        <header className="flex items-center justify-between border-b border-sand px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Tendencia de balance total</h2>
            <p className="text-sm text-slate-500">Histórico acumulado por mes</p>
          </div>
        </header>
        <div className="h-72 px-2 py-4">
          {historyChartData.length > 1 ? (
            <ResponsiveContainer>
              <LineChart data={historyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" stroke="#475569" />
                <YAxis stroke="#475569" tickFormatter={(value) => formatAxisCurrency(value)} />
                <Tooltip formatter={(value: number) => formatCurrencyUSD(value)} />
                <Line type="monotone" dataKey="balance" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No hay suficientes meses para graficar la tendencia." />
          )}
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
                      const colorKey = entry.key.toLowerCase();
                      const fill = COLORS[colorKey] ?? '#0f172a';
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
        {!loading && rows.length === 0 && !error && (
          <EmptyState message="No hay balances registrados para el mes seleccionado." />
        )}
        {error && <ErrorState message={error} />}
      </section>
    </div>
  );
};

export default BalancePage;

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center text-sm text-slate-500">
    <Download className="h-5 w-5 text-slate-400" />
    <span>{message}</span>
  </div>
);

const ErrorState = ({ message }: { message: string }) => (
  <div className="px-6 py-6 text-center text-sm text-rose-600">{message}</div>
);

const formatAxisCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return value.toFixed(0);
};
