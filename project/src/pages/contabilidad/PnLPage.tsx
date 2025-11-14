// src/pages/contabilidad/PnLPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Download,
  FileSpreadsheet,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wallet2,
} from 'lucide-react';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { formatCurrencyUSD } from '../../lib/format';
import {
  formatDateIso,
  rpcWithFallback,
  type RpcParams,
} from './rpcHelpers';
import { exportToCsv, exportToXlsx, formatNumber } from './exportUtils';
import {
  ToastContainer,
  createToast,
  dismissToast,
  type ToastItem,
} from '../../components/Toast';
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  LineChart,
  Line,
} from 'recharts';
import {
  fetchAccountCatalog,
  fetchJournalsInRange,
  getMonthBounds,
  getMonthSequence,
  monthKeyFromDate,
  normalizeAccountType,
  type AccountCatalogEntry,
} from './glData';

/* ────────────────────────────────────────────────────────────────────────────
   Tipos
--------------------------------------------------------------------------- */
interface PnLRow {
  mes: string; // 'YYYY-MM-01'
  sucursalId: string | null; // uuid o null cuando total
  ingresos: number;
  cogs: number;
  gastosTotales: number;
  utilidadOperativa: number;
}

interface PostJournalResult {
  ok?: boolean;
  msg?: string;
  journal_id?: string;
  journalId?: string;
}

type AccountTypeKey = 'income' | 'cogs' | 'expense' | '';

const INCOME_TYPES = new Set(['income', 'ingreso', 'revenue', 'revenues']);
const COGS_TYPES = new Set(['cogs', 'cost_of_goods', 'costodeventa', 'costo', 'cost']);
const EXPENSE_TYPES = new Set(['expense', 'expenses', 'gasto', 'gastos', 'operating_expense']);

/* ────────────────────────────────────────────────────────────────────────────
   Helpers base
--------------------------------------------------------------------------- */
const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Error desconocido';
};

const buildPostVariants = (mes: string, sucursalId: string | null): RpcParams[] => [
  { p_mes: mes, p_sucursal_id: sucursalId },
  { mes, p_sucursal_id: sucursalId },
  { mes, sucursal_id: sucursalId },
  { p_mes: mes, sucursal_id: sucursalId },
  { mes, sucursalId },
];

const DEFAULT_ROW: PnLRow = {
  mes: '',
  sucursalId: null,
  ingresos: 0,
  cogs: 0,
  gastosTotales: 0,
  utilidadOperativa: 0,
};

const mapAccountType = (entry: AccountCatalogEntry | undefined): AccountTypeKey => {
  const normalized = normalizeAccountType(entry?.type);
  if (INCOME_TYPES.has(normalized)) return 'income';
  if (COGS_TYPES.has(normalized)) return 'cogs';
  if (EXPENSE_TYPES.has(normalized)) return 'expense';
  return '';
};

const computePnLAggregates = (
  monthKeys: string[],
  journals: Awaited<ReturnType<typeof fetchJournalsInRange>>,
  catalog: Record<string, AccountCatalogEntry>,
  sucursalId: string | null
): PnLRow[] => {
  const base = new Map<string, PnLRow>();
  monthKeys.forEach((month) => {
    base.set(month, {
      mes: month,
      sucursalId,
      ingresos: 0,
      cogs: 0,
      gastosTotales: 0,
      utilidadOperativa: 0,
    });
  });

  journals.forEach((journal) => {
    const monthKey = monthKeyFromDate(journal.journal_date);
    const target = base.get(monthKey);
    if (!target) return;
    journal.lines.forEach((line) => {
      const account = catalog[line.account_id ?? ''];
      const type = mapAccountType(account);
      if (!type) return;
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;
      if (type === 'income') {
        target.ingresos += credit - debit;
      } else if (type === 'cogs') {
        target.cogs += debit - credit;
      } else if (type === 'expense') {
        target.gastosTotales += debit - credit;
      }
    });
  });

  return Array.from(base.values()).map((row) => ({
    ...row,
    ingresos: row.ingresos,
    cogs: row.cogs,
    gastosTotales: row.gastosTotales,
    utilidadOperativa: row.ingresos - row.cogs - row.gastosTotales,
  }));
};

/* ────────────────────────────────────────────────────────────────────────────
   Componente principal
--------------------------------------------------------------------------- */
export const PnLPage = () => {
  const { sucursales, sucursalSeleccionada } = useAuthOrg();
  const [mes, setMes] = useState('');
  const [selectedSucursal, setSelectedSucursal] = useState(''); // '' = todas
  const [rows, setRows] = useState<PnLRow[]>([]);
  const [previousRow, setPreviousRow] = useState<PnLRow | null>(null);
  const [historyRows, setHistoryRows] = useState<PnLRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [catalog, setCatalog] = useState<Record<string, AccountCatalogEntry>>({});

  useEffect(() => {
    const today = new Date();
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    setMes(ym);
  }, []);

  useEffect(() => {
    if (sucursalSeleccionada?.id) setSelectedSucursal(String(sucursalSeleccionada.id));
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

    const filterMes = `${mes}-01`;
    const sucursalId = selectedSucursal || null;
    const historyMonths = getMonthSequence(filterMes, 6);
    if (historyMonths.length === 0) {
      setRows([]);
      setHistoryRows([]);
      setPreviousRow(null);
      setError('Mes inválido');
      setLoading(false);
      return;
    }

    const historyStart = historyMonths[0];
    const { end: historyEnd } = getMonthBounds(historyMonths[historyMonths.length - 1]);

    try {
      const [catalogData, journals] = await Promise.all([
        ensureCatalog(),
        fetchJournalsInRange({ from: historyStart, to: historyEnd, sucursalId }),
      ]);

      const aggregates = computePnLAggregates(historyMonths, journals, catalogData, sucursalId);
      setHistoryRows(aggregates);

      const current = aggregates.find((row) => row.mes === filterMes) ?? {
        ...DEFAULT_ROW,
        mes: filterMes,
        sucursalId,
      };
      const prevIndex = historyMonths.indexOf(filterMes) - 1;
      const previous = prevIndex >= 0 ? aggregates[prevIndex] ?? null : null;

      const hasData =
        journals.some((journal) => monthKeyFromDate(journal.journal_date) === filterMes) ||
        Math.abs(current.ingresos) > 0 ||
        Math.abs(current.cogs) > 0 ||
        Math.abs(current.gastosTotales) > 0;

      setRows(hasData ? [current] : []);
      setPreviousRow(previous);
    } catch (err) {
      console.error('Error cargando Estado de Resultados', err);
      setRows([]);
      setPreviousRow(null);
      setHistoryRows([]);
      setError(getErrorMessage(err) ?? 'No fue posible obtener el estado de resultados.');
    } finally {
      setLoading(false);
    }
  }, [ensureCatalog, mes, selectedSucursal]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentRow = useMemo(() => rows[0] ?? null, [rows]);

  const totals = useMemo(
    () =>
      currentRow ?? {
        ...DEFAULT_ROW,
        mes: mes ? `${mes}-01` : '',
        sucursalId: selectedSucursal || null,
      },
    [currentRow, mes, selectedSucursal]
  );

  const netMargin = useMemo(() => {
    if (!currentRow) return 0;
    if (currentRow.ingresos === 0) return 0;
    return (currentRow.utilidadOperativa / currentRow.ingresos) * 100;
  }, [currentRow]);

  const comparisons = useMemo(() => {
    const previous = previousRow ?? null;
    const build = (current: number, prev: number) => {
      const delta = current - prev;
      const pct = prev === 0 ? null : (delta / prev) * 100;
      return { current, prev, delta, pct };
    };
    return {
      ingresos: build(currentRow?.ingresos ?? 0, previous?.ingresos ?? 0),
      cogs: build(currentRow?.cogs ?? 0, previous?.cogs ?? 0),
      gastos: build(currentRow?.gastosTotales ?? 0, previous?.gastosTotales ?? 0),
      utilidad: build(currentRow?.utilidadOperativa ?? 0, previous?.utilidadOperativa ?? 0),
      margen: build(netMargin, previous && previous.ingresos !== 0 ? (previous.utilidadOperativa / previous.ingresos) * 100 : 0),
    };
  }, [currentRow, netMargin, previousRow]);

  const historyData = useMemo(
    () =>
      historyRows
        .map((row) => ({
          mes: formatDateIso(row.mes),
          ingresos: row.ingresos,
          cogs: row.cogs,
          utilidad: row.utilidadOperativa,
        }))
        .filter((row) => row.mes),
    [historyRows]
  );

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => createToast(setToasts, toast),
    []
  );

  const handlePostMes = useCallback(async () => {
    if (!mes) return;
    setPosting(true);
    try {
      const filterMes = `${mes}-01`;
      const sucursalId = selectedSucursal || null;

      if (!sucursalId) {
        pushToast({
          tone: 'warning',
          title: 'Selecciona una sucursal',
          description: 'Para postear, elige una sucursal específica.',
        });
        setPosting(false);
        return;
      }

      const result = await rpcWithFallback<PostJournalResult>(
        'api_post_journal_auto',
        buildPostVariants(filterMes, sucursalId)
      );
      const success = result?.ok ?? Boolean(result?.journal_id ?? result?.journalId);
      if (success) {
        pushToast({
          tone: 'success',
          title: 'Mes posteado con éxito',
          description: result?.msg ?? 'Se generó el journal automático para el mes seleccionado.',
        });
        fetchData();
      } else {
        pushToast({
          tone: 'warning',
          title: 'Posteo incompleto',
          description: result?.msg ?? 'La función no devolvió confirmación.',
        });
      }
    } catch (err: unknown) {
      console.error('Error ejecutando api_post_journal_auto', err);
      pushToast({
        tone: 'error',
        title: 'No se pudo postear el mes',
        description: getErrorMessage(err),
      });
    } finally {
      setPosting(false);
    }
  }, [fetchData, mes, pushToast, selectedSucursal]);

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    const csvRows = rows.map((row) => [
      row.mes,
      row.sucursalId ?? 'Todas',
      formatNumber(row.ingresos),
      formatNumber(row.cogs),
      formatNumber(row.gastosTotales),
      formatNumber(row.utilidadOperativa),
    ]);
    exportToCsv(
      csvRows,
      ['Mes', 'Sucursal', 'Ingresos', 'COGS', 'Gastos', 'Utilidad'],
      { suffix: 'pnl' }
    );
  };

  const handleExportXlsx = () => {
    if (rows.length === 0) return;
    const data = rows.map((row) => ({
      Mes: row.mes,
      Sucursal: row.sucursalId ?? 'Todas',
      Ingresos: row.ingresos,
      COGS: row.cogs,
      Gastos: row.gastosTotales,
      Utilidad: row.utilidadOperativa,
    }));
    exportToXlsx(data, 'P&L', { suffix: 'pnl' });
  };

  /* ────────────────────────────────────────────────────────────────────────────
     Render
  --------------------------------------------------------------------------- */
  return (
    <div className="space-y-6">
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => dismissToast(setToasts, id)}
      />

      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-bean">Estado de Resultados (P&amp;L)</h1>
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
          <button
            type="button"
            onClick={handlePostMes}
            disabled={posting || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-white shadow disabled:opacity-60"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet2 size={16} />}
            {posting ? 'Posteando…' : 'Postear mes'}
          </button>
        </div>
      </header>

      {/* Filtros */}
      <section className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Mes
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            />
          </label>
          <label className="md:col-span-2 flex flex-col gap-2 text-sm text-slate7g">
            Sucursal
            <select
              value={selectedSucursal}
              onChange={(e) => setSelectedSucursal(e.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            >
              <option value="">Todas mis sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
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

      {/* Métricas */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CardMetric
          title="Ingresos"
          icon="up"
          value={totals.ingresos}
          comp={comparisons.ingresos}
        />
        <CardMetric
          title="COGS"
          icon="down"
          value={totals.cogs}
          comp={comparisons.cogs}
          negativeIsBad
        />
        <CardMetric
          title="Gastos"
          icon="wallet"
          value={totals.gastosTotales}
          comp={comparisons.gastos}
          negativeIsBad
        />
        <article className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wide">Utilidad</span>
            <Wallet2 className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-800">
            {formatCurrencyUSD(totals.utilidadOperativa)}
          </p>
          <p className="text-xs text-slate-500">Margen neto: {netMargin.toFixed(1)}%</p>
          <ComparisonPill comparison={comparisons.utilidad} label="Utilidad vs mes anterior" />
          <ComparisonPill comparison={comparisons.margen} label="Margen vs mes anterior" isMargin />
        </article>
      </section>

      {/* Charts */}
      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-sand bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-sand px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Tendencia de ingresos vs utilidad</h2>
              <p className="text-sm text-slate-500">Últimos periodos reportados</p>
            </div>
            <BarChart3 className="h-5 w-5 text-slate-400" />
          </header>
          <div className="h-72 px-2 py-4">
            {historyData.length > 1 ? (
              <ResponsiveContainer>
                <BarChart data={historyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis tickFormatter={(v) => formatAxisCurrency(v)} />
                  <Tooltip formatter={(v: number) => formatCurrencyUSD(v)} />
                  <Legend />
                  <Bar dataKey="ingresos" name="Ingresos" />
                  <Bar dataKey="utilidad" name="Utilidad" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Aún no hay suficientes periodos para graficar." />
            )}
          </div>
        </article>
        <article className="rounded-2xl border border-sand bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-sand px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Margen neto histórico</h2>
              <p className="text-sm text-slate-500">Tendencia porcentual por mes</p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-slate-400" />
          </header>
          <div className="h-72 px-2 py-4">
            {historyData.length > 1 ? (
              <ResponsiveContainer>
                <LineChart
                  data={historyData.map((r) => ({
                    mes: r.mes,
                    margen: r.ingresos === 0 ? 0 : (r.utilidad / r.ingresos) * 100,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Line type="monotone" dataKey="margen" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Se necesita al menos dos meses para calcular el margen." />
            )}
          </div>
        </article>
      </section>

      {/* Detalle del período */}
      <section className="rounded-2xl border border-sand bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-sand px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Detalle del periodo</h2>
            <p className="text-sm text-slate-500">
              {mes ? `Mes ${formatDateIso(`${mes}-01`)}` : 'Selecciona un mes'}
            </p>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-sand text-sm">
            <tbody className="divide-y divide-sand/70">
              <tr>
                <td className="px-6 py-3 font-medium text-slate-600">Ingresos</td>
                <td className="px-6 py-3 text-right font-mono text-base">
                  {formatCurrencyUSD(totals.ingresos)}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-3 font-medium text-slate-600">Costo de ventas (COGS)</td>
                <td className="px-6 py-3 text-right font-mono text-base">
                  {formatCurrencyUSD(totals.cogs)}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-3 font-medium text-slate-600">Gastos operativos</td>
                <td className="px-6 py-3 text-right font-mono text-base">
                  {formatCurrencyUSD(totals.gastosTotales)}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-3 font-semibold text-slate-700">Utilidad operativa</td>
                <td className="px-6 py-3 text-right font-mono text-lg text-emerald-700">
                  {formatCurrencyUSD(totals.utilidadOperativa)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando métricas…
          </div>
        )}
        {!loading && rows.length === 0 && !error && (
          <EmptyState message="No hay datos para el mes seleccionado." />
        )}
        {error && <ErrorState message={error} />}
      </section>
    </div>
  );
};

export default PnLPage;

/* ────────────────────────────────────────────────────────────────────────────
   UI helpers
--------------------------------------------------------------------------- */
interface Comparison {
  current: number;
  prev: number;
  delta: number;
  pct: number | null;
}

const CardMetric = ({
  title,
  icon,
  value,
  comp,
  negativeIsBad,
}: {
  title: string;
  icon: 'up' | 'down' | 'wallet';
  value: number;
  comp: Comparison;
  negativeIsBad?: boolean;
}) => {
  const Icon = icon === 'up' ? TrendingUp : icon === 'down' ? TrendingDown : Wallet;
  const isPositive = comp.delta >= 0;
  const isGood = negativeIsBad ? !isPositive : isPositive;
  const tone =
    comp.pct === null
      ? 'text-slate-500 bg-slate-50'
      : isGood
      ? 'text-emerald-600 bg-emerald-50'
      : 'text-rose-600 bg-rose-50';

  return (
    <article className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-800">
        {formatCurrencyUSD(value)}
      </p>
      <ComparisonPill comparison={comp} label="vs mes anterior" negativeIsBad={negativeIsBad} />
    </article>
  );
};

const ComparisonPill = ({
  comparison,
  label,
  negativeIsBad,
  isMargin,
}: {
  comparison: Comparison;
  label: string;
  negativeIsBad?: boolean;
  isMargin?: boolean;
}) => {
  const isPositive = comparison.delta >= 0;
  const isGood = negativeIsBad ? !isPositive : isPositive;
  const tone =
    comparison.pct === null
      ? 'text-slate-600 bg-slate-100'
      : isGood
      ? 'text-emerald-700 bg-emerald-50'
      : 'text-rose-700 bg-rose-50';
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  const formatValue = (value: number) => (isMargin ? `${value.toFixed(1)}%` : formatCurrencyUSD(value));

  return (
    <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
      <Icon className="h-4 w-4" />
      <span>
        {label}: {formatValue(comparison.delta)}
        {comparison.pct !== null ? ` (${comparison.pct.toFixed(1)}%)` : ''}
      </span>
    </div>
  );
};

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
