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
import { supabase } from '../../lib/supabase';
import {
  formatDateIso,
  rpcWithFallback,
  toNumber,
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

/* ────────────────────────────────────────────────────────────────────────────
   Tipos
--------------------------------------------------------------------------- */
interface PnLRow {
  mes: string;
  sucursalId: string | null;
  ingresos: number;
  cogs: number;
  gastosOperativos: number;
  planilla: number;
  gastosTotales: number;
  utilidadOperativa: number;
}
interface PostJournalResult {
  ok?: boolean;
  msg?: string;
  journal_id?: string;
  journalId?: string;
}

/* ────────────────────────────────────────────────────────────────────────────
   Utils
--------------------------------------------------------------------------- */
const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Error desconocido';
};

const VALUE_FIELDS = {
  ingresos: ['ingresos', 'total_ingresos', 'venta_neta', 'ventas_netas', 'ventas_brutas', 'ventas'],
  cogs: ['cogs', 'total_cogs', 'costo', 'costo_total', 'costo_ventas'],
  gastos: ['gastos', 'gastos_totales', 'gasto_total', 'total_gastos', 'monto_total', 'monto'],
  planilla: ['total_planilla', 'planilla', 'labor', 'total_labor', 'costo_planilla', 'monto'],
} as const;

const SUCURSAL_ID_FIELDS = [
  'sucursal_id',
  'sucursalId',
  'branch_id',
  'tienda_id',
  'local_id',
  'id_sucursal',
];

const SUCURSAL_NAME_FIELDS = [
  'sucursal_nombre',
  'sucursal',
  'nombre_sucursal',
  'branch_name',
  'tienda_nombre',
];

const PERIOD_FIELDS = ['mes', 'periodo', 'fecha', 'period', 'periodo_inicio'];

const YEAR_FIELDS = ['ano', 'anio', 'year'];
const MONTH_FIELDS = ['mes', 'month', 'mes_numero'];

const padMonth = (value: number) => String(value).padStart(2, '0');

const ensureMonthIso = (value: string): string => {
  if (!value) return '';
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 10);
  const cleaned = value.split('T')[0]?.split(' ')[0];
  if (cleaned && /^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  return value;
};

const toMonthStart = (input: unknown): string | null => {
  if (!input && input !== 0) return null;
  if (input instanceof Date) {
    return `${input.getFullYear()}-${padMonth(input.getMonth() + 1)}-01`;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
    if (/^\d{4}\d{2}$/.test(trimmed)) {
      const year = Number(trimmed.slice(0, 4));
      const month = Number(trimmed.slice(4, 6));
      if (!Number.isNaN(year) && !Number.isNaN(month)) return `${year}-${padMonth(month)}-01`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [dd, mm, yyyy] = trimmed.split('/');
      return `${yyyy}-${mm}-01`;
    }
  }
  if (typeof input === 'number') {
    const str = String(input);
    if (str.length === 6) {
      const year = Number(str.slice(0, 4));
      const month = Number(str.slice(4, 6));
      if (!Number.isNaN(year) && !Number.isNaN(month)) return `${year}-${padMonth(month)}-01`;
    }
  }
  return null;
};

const extractPeriod = (row: Record<string, any>): string | null => {
  for (const key of PERIOD_FIELDS) {
    if (row[key] !== undefined) {
      const iso = toMonthStart(row[key]);
      if (iso) return iso;
    }
  }

  const yearField = YEAR_FIELDS.find((key) => row[key] !== undefined && row[key] !== null);
  const monthField = MONTH_FIELDS.find((key) => row[key] !== undefined && row[key] !== null);
  if (yearField && monthField) {
    const year = Number(row[yearField]);
    const month = Number(row[monthField]);
    if (!Number.isNaN(year) && !Number.isNaN(month)) {
      return `${year}-${padMonth(month)}-01`;
    }
  }

  return null;
};

const extractSucursalId = (row: Record<string, any>): string | null => {
  for (const key of SUCURSAL_ID_FIELDS) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
  }
  return null;
};

const extractSucursalName = (row: Record<string, any>): string | null => {
  for (const key of SUCURSAL_NAME_FIELDS) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const matchesSucursal = (
  row: Record<string, any>,
  sucursalId: string | null,
  sucursalName: string | null
) => {
  if (!sucursalId) return true;
  const rowId = extractSucursalId(row);
  if (rowId) return String(rowId) === String(sucursalId);
  const rowName = extractSucursalName(row);
  if (rowName && sucursalName) {
    return rowName.toLowerCase() === sucursalName.toLowerCase();
  }
  return false;
};

const sumFields = (row: Record<string, any>, fields: readonly string[]): number => {
  let total = 0;
  let matched = false;
  for (const field of fields) {
    const value = row[field];
    if (value !== undefined && value !== null && value !== '') {
      total += toNumber(value);
      matched = true;
    }
  }
  return matched ? total : 0;
};

const aggregateByMonth = (
  rows: Record<string, any>[],
  months: Set<string>,
  sucursalId: string | null,
  sucursalName: string | null,
  fields: readonly string[]
) => {
  const map = new Map<string, number>();
  months.forEach((month) => map.set(month, 0));

  for (const row of rows) {
    const period = extractPeriod(row);
    if (!period || !months.has(period)) continue;
    if (!matchesSucursal(row, sucursalId, sucursalName)) continue;
    const amount = sumFields(row, fields);
    if (!amount && amount !== 0) continue;
    map.set(period, (map.get(period) ?? 0) + amount);
  }

  return map;
};

const isRetryableError = (error: any) => {
  if (!error) return false;
  const message = String(error.message ?? error?.details ?? '').toLowerCase();
  return (
    message.includes('column') ||
    message.includes('operator does not exist') ||
    message.includes('invalid input syntax') ||
    message.includes('function ') ||
    message.includes('date/time field value out of range')
  );
};

const fetchViewRowsForRange = async (
  view: string,
  from: string,
  to: string
): Promise<Record<string, any>[]> => {
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const fromMonthNum = Number(from.slice(5, 7));

  const variants = [
    () => supabase.from(view).select('*').gte('mes', from).lte('mes', to),
    () => supabase.from(view).select('*').gte('mes', fromMonth).lte('mes', toMonth),
    () => supabase.from(view).select('*').gte('periodo', from).lte('periodo', to),
    () => supabase.from(view).select('*').gte('periodo', fromMonth).lte('periodo', toMonth),
    () => supabase.from(view).select('*').gte('fecha', from).lte('fecha', to),
    () =>
      supabase
        .from(view)
        .select('*')
        .eq('ano', fromYear)
        .eq('mes', Number.isNaN(fromMonthNum) ? fromMonth : fromMonthNum),
    () =>
      supabase
        .from(view)
        .select('*')
        .eq('anio', fromYear)
        .eq('mes', Number.isNaN(fromMonthNum) ? fromMonth : fromMonthNum),
    () =>
      supabase
        .from(view)
        .select('*')
        .gte('ano', fromYear)
        .lte('ano', toYear),
  ];

  for (const factory of variants) {
    try {
      const { data, error } = await factory();
      if (error) {
        if (isRetryableError(error)) {
          continue;
        }
        throw error;
      }
      return data ?? [];
    } catch (err: any) {
      if (!isRetryableError(err)) throw err;
    }
  }

  const { data, error } = await supabase.from(view).select('*');
  if (error) throw error;
  return data ?? [];
};

const buildMonthsWindow = (current: string, size: number): string[] => {
  const iso = ensureMonthIso(current);
  if (!iso) return [];
  const [year, month] = iso.split('-').map(Number);
  if (Number.isNaN(year) || Number.isNaN(month)) return [];
  const base = new Date(Date.UTC(year, month - 1, 1));
  const months: string[] = [];
  for (let offset = size - 1; offset >= 0; offset -= 1) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() - offset);
    months.push(`${d.getUTCFullYear()}-${padMonth(d.getUTCMonth() + 1)}-01`);
  }
  return months;
};

const buildPostVariants = (mes: string, sucursalId: string | null): RpcParams[] => [
  { p_mes: mes, p_sucursal_id: sucursalId },
  { mes, p_sucursal_id: sucursalId },
  { mes, sucursal_id: sucursalId },
  { p_mes: mes, sucursal_id: sucursalId },
  { mes, sucursalId },
];
const getNetMargin = (row: PnLRow) =>
  !row.ingresos ? 0 : (row.utilidadOperativa / row.ingresos) * 100;

/* ────────────────────────────────────────────────────────────────────────────
   Componente
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

  /*
   * Estado de resultados mensual: agregamos ingresos, COGS, gastos operativos
   * y planilla usando las vistas contables oficiales y filtramos por mes/sucursal
   * sin depender de la RPC previa.
   */
  const fetchData = useCallback(async () => {
    if (!mes) return;
    setLoading(true);
    setError(null);

    const periodIso = ensureMonthIso(mes);
    const sucursalId = selectedSucursal || null;
    const sucursalName = sucursalId
      ? sucursales.find((s) => String(s.id) === String(sucursalId))?.nombre ?? null
      : null;

    try {
      const months = buildMonthsWindow(periodIso, 6);
      const rangeStart = months[0] ?? periodIso;
      const rangeEnd = months[months.length - 1] ?? periodIso;
      const monthsSet = new Set(months);

      const [ingresosRows, cogsRows, gastosRows, planillaRows] = await Promise.all([
        fetchViewRowsForRange('v_pnl_mensual_ingresos', rangeStart, rangeEnd),
        fetchViewRowsForRange('v_cogs_mensual_sucursal', rangeStart, rangeEnd),
        fetchViewRowsForRange('v_gastos_mensual_sucursal', rangeStart, rangeEnd),
        fetchViewRowsForRange('v_planilla_totales_norm', rangeStart, rangeEnd),
      ]);

      const ingresosMap = aggregateByMonth(
        ingresosRows,
        monthsSet,
        sucursalId,
        sucursalName,
        VALUE_FIELDS.ingresos
      );
      const cogsMap = aggregateByMonth(
        cogsRows,
        monthsSet,
        sucursalId,
        sucursalName,
        VALUE_FIELDS.cogs
      );
      const gastosMap = aggregateByMonth(
        gastosRows,
        monthsSet,
        sucursalId,
        sucursalName,
        VALUE_FIELDS.gastos
      );
      const planillaMap = aggregateByMonth(
        planillaRows,
        monthsSet,
        sucursalId,
        sucursalName,
        VALUE_FIELDS.planilla
      );

      const monthlyRows: PnLRow[] = months.map((month) => {
        const ingresos = ingresosMap.get(month) ?? 0;
        const cogs = cogsMap.get(month) ?? 0;
        const gastosOperativos = gastosMap.get(month) ?? 0;
        const planilla = planillaMap.get(month) ?? 0;
        const gastosTotales = gastosOperativos + planilla;
        const utilidadOperativa = ingresos - cogs - gastosTotales;
        return {
          mes: month,
          sucursalId: sucursalId ? String(sucursalId) : null,
          ingresos,
          cogs,
          gastosOperativos,
          planilla,
          gastosTotales,
          utilidadOperativa,
        };
      });

      const currentRow = monthlyRows.find((row) => row.mes === periodIso) ?? null;
      const previousRowCandidate =
        monthlyRows.length >= 2 ? monthlyRows[monthlyRows.length - 2] : null;

      setRows(currentRow ? [currentRow] : []);
      setPreviousRow(previousRowCandidate);
      setHistoryRows(monthlyRows);
    } catch (err: unknown) {
      console.error('Error cargando P&L', err);
      setRows([]);
      setPreviousRow(null);
      setHistoryRows([]);
      setError(getErrorMessage(err) ?? 'No fue posible obtener el estado de resultados.');
    } finally {
      setLoading(false);
    }
  }, [mes, selectedSucursal, sucursales]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentRow = useMemo(() => rows[0] ?? null, [rows]);

  const totals = useMemo(
    () =>
      currentRow ?? {
        mes: '',
        sucursalId: null,
        ingresos: 0,
        cogs: 0,
        gastosOperativos: 0,
        planilla: 0,
        gastosTotales: 0,
        utilidadOperativa: 0,
      },
    [currentRow]
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
      margen: build(netMargin, previous ? getNetMargin(previous) : 0),
    };
  }, [currentRow, netMargin, previousRow]);

  const historyData = useMemo(
    () =>
      historyRows.map((row) => ({
        mes: formatDateIso(row.mes),
        ingresos: row.ingresos,
        cogs: row.cogs,
        utilidad: row.utilidadOperativa,
      })),
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
      const success =
        result?.ok ?? Boolean(result?.journal_id ?? result?.journalId);
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
      formatNumber(row.planilla),
      formatNumber(row.gastosOperativos),
      formatNumber(row.gastosTotales),
      formatNumber(row.utilidadOperativa),
    ]);
    exportToCsv(
      csvRows,
      [
        'Mes',
        'Sucursal',
        'Ingresos',
        'COGS',
        'Planilla',
        'Gastos operativos',
        'Gastos totales',
        'Utilidad',
      ],
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
      Planilla: row.planilla,
      'Gastos operativos': row.gastosOperativos,
      'Gastos totales': row.gastosTotales,
      Utilidad: row.utilidadOperativa,
    }));
    exportToXlsx(data, 'P&L', { suffix: 'pnl' });
  };

  return (
    <div className="space-y-6">
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => dismissToast(setToasts, id)}
      />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-bean">Estado de Resultados (P&amp;L)</h1>
          <p className="text-slate7g">
            Visualiza ingresos, COGS, gastos operativos y utilidad neta del mes.
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
                <td className="px-6 py-3 font-medium text-slate-600">Planilla (labor)</td>
                <td className="px-6 py-3 text-right font-mono text-base">
                  {formatCurrencyUSD(totals.planilla ?? 0)}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-3 font-medium text-slate-600">Gastos operativos</td>
                <td className="px-6 py-3 text-right font-mono text-base">
                  {formatCurrencyUSD(totals.gastosOperativos ?? 0)}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-3 font-medium text-slate-600">Gastos totales</td>
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
  const tone = isGood ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  const formatValue = (value: number) =>
    isMargin ? `${value.toFixed(1)}%` : formatCurrencyUSD(value);
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
