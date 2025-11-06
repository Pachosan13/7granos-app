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
interface PnLRawRow {
  mes?: string;
  periodo?: string;
  sucursal_id?: string | null;
  sucursalId?: string | null;
  ingresos?: number | string | null;
  cogs?: number | string | null;
  gastos_totales?: number | string | null;
  gastos?: number | string | null;
  utilidad_operativa?: number | string | null;
  utilidad?: number | string | null;
}
interface PnLRow {
  mes: string;
  sucursalId: string | null;
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

/* ────────────────────────────────────────────────────────────────────────────
   Utils
--------------------------------------------------------------------------- */
const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Error desconocido';
};

const buildVariants = (mes: string, sucursalId: string | null): RpcParams[] => [
  { p_mes: mes, p_sucursal_id: sucursalId },
  { mes, p_sucursal_id: sucursalId },
  { mes, sucursal_id: sucursalId },
  { p_mes: mes, sucursal_id: sucursalId },
  { mes, sucursalId },
];

const buildPostVariants = (mes: string, sucursalId: string | null): RpcParams[] => [
  { p_mes: mes, p_sucursal_id: sucursalId },
  { mes, p_sucursal_id: sucursalId },
  { mes, sucursal_id: sucursalId },
  { p_mes: mes, sucursal_id: sucursalId },
  { mes, sucursalId },
];

const normalize = (rows: PnLRawRow[]): PnLRow[] =>
  rows.map((row) => {
    const mes = row.mes || row.periodo || '';
    const sucursalId =
      (row.sucursal_id ?? row.sucursalId ?? null) !== undefined
        ? (row.sucursal_id ?? row.sucursalId ?? null)
        : null;

    const ingresos = toNumber(row.ingresos);
    const cogs = toNumber(row.cogs);
    const gastosTotales = toNumber(row.gastos_totales ?? row.gastos ?? 0);
    const utilidadOperativa = toNumber(
      row.utilidad_operativa ?? row.utilidad ?? ingresos - cogs - gastosTotales
    );

    return {
      mes: mes ? mes.slice(0, 10) : '',
      sucursalId: sucursalId ? String(sucursalId) : null,
      ingresos,
      cogs,
      gastosTotales,
      utilidadOperativa,
    };
  });

const aggregate = (rows: PnLRow[]): PnLRow => {
  const agg = rows.reduce(
    (acc, r) => {
      acc.ingresos += r.ingresos || 0;
      acc.cogs += r.cogs || 0;
      acc.gastosTotales += r.gastosTotales || 0;
      acc.utilidadOperativa += r.utilidadOperativa || 0;
      return acc;
    },
    { ingresos: 0, cogs: 0, gastosTotales: 0, utilidadOperativa: 0 }
  );
  return {
    mes: rows[0]?.mes ?? '',
    sucursalId: null,
    ...agg,
  };
};

const getPreviousMonth = (isoDate: string) => {
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return null;
    d.setMonth(d.getMonth() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
  } catch {
    return null;
  }
};

const getNetMargin = (row: PnLRow) =>
  !row.ingresos ? 0 : (row.utilidadOperativa / row.ingresos) * 100;

/* ────────────────────────────────────────────────────────────────────────────
   Helper: ingresos consolidados desde la vista maestra
--------------------------------------------------------------------------- */
async function fetchIngresosAll(mesISO: string) {
  const { data, error } = await supabase
    .from('v_pnl_mensual_ingresos')
    .select('mes,sucursal_id_final,ingresos')
    .eq('mes', mesISO);

  if (error) throw error;
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const id = String((r as any).sucursal_id_final);
    const val = Number((r as any).ingresos ?? 0);
    map.set(id, (map.get(id) ?? 0) + val);
  }
  return map;
}

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

  useEffect(() => {
    const today = new Date();
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    setMes(ym);
  }, []);

  useEffect(() => {
    if (sucursalSeleccionada?.id) setSelectedSucursal(String(sucursalSeleccionada.id));
  }, [sucursalSeleccionada?.id]);

  /* ────────────────────────────────────────────────────────────────────────────
     Carga de datos (integrada con maestro + comparativo)
  --------------------------------------------------------------------------- */
  const fetchData = useCallback(async () => {
    if (!mes) return;
    setLoading(true);
    setError(null);
    const filterMes = `${mes}-01`;
    const sucursalId = selectedSucursal || null;

    try {
      if (sucursalId) {
        // Sucursal específica (RPC estable)
        const data =
          (await rpcWithFallback<PnLRawRow[]>(
            'api_get_pyg',
            buildVariants(filterMes, sucursalId)
          )) ?? [];
        setRows(normalize(data));

        const prevMonth = getPreviousMonth(filterMes);
        if (prevMonth) {
          const prev =
            (await rpcWithFallback<PnLRawRow[]>(
              'api_get_pyg',
              buildVariants(prevMonth, sucursalId)
            )) ?? [];
          setPreviousRow(normalize(prev)[0] ?? null);
        } else {
          setPreviousRow(null);
        }
      } else {
        // Todas las sucursales → ingresos desde vista maestra + COGS/Gastos desde comparativo
        const ingresosMap = await fetchIngresosAll(filterMes);

        const { data: otrosRows, error: errOtros } = await supabase
          .from('v_pyg_comparativo')
          .select('*')
          .eq('mes', filterMes)
          .order('sucursal_id', { ascending: true });
        if (errOtros) throw errOtros;

        const merged: PnLRow[] = [];
        const byId = new Map<string, PnLRow>();

        for (const r of (otrosRows ?? []) as PnLRawRow[]) {
          const id = String(r.sucursal_id ?? '');
          const cogs = toNumber(r.cogs);
          const gastos = toNumber(r.gastos_totales ?? r.gastos ?? 0);
          const ingresos = ingresosMap.get(id) ?? 0;

          const row: PnLRow = {
            mes: (r.mes || r.periodo || filterMes).slice(0, 10),
            sucursalId: id || null,
            ingresos,
            cogs,
            gastosTotales: gastos,
            utilidadOperativa: ingresos - cogs - gastos,
          };
          byId.set(id, row);
        }

        // Ingresos que no tienen fila en comparativo: agrega con COGS/Gastos = 0
        for (const [id, ingresos] of ingresosMap.entries()) {
          if (!byId.has(id)) {
            byId.set(id, {
              mes: filterMes,
              sucursalId: id,
              ingresos,
              cogs: 0,
              gastosTotales: 0,
              utilidadOperativa: ingresos,
            });
          }
        }

        for (const v of byId.values()) merged.push(v);
        setRows(merged.length ? [aggregate(merged)] : []);

        // Mes anterior consolidado
        const prevMonth = getPreviousMonth(filterMes);
        if (prevMonth) {
          const prevIngresosMap = await fetchIngresosAll(prevMonth);
          const { data: prevOtros } = await supabase
            .from('v_pyg_comparativo')
            .select('*')
            .eq('mes', prevMonth);

          const mergedPrev: PnLRow[] = [];
          const prevMap = new Map<string, PnLRow>();

          for (const r of (prevOtros ?? []) as PnLRawRow[]) {
            const id = String(r.sucursal_id ?? '');
            const cogs = toNumber(r.cogs);
            const gastos = toNumber(r.gastos_totales ?? r.gastos ?? 0);
            const ingresos = prevIngresosMap.get(id) ?? 0;
            prevMap.set(id, {
              mes: (r.mes || r.periodo || prevMonth).slice(0, 10),
              sucursalId: id || null,
              ingresos,
              cogs,
              gastosTotales: gastos,
              utilidadOperativa: ingresos - cogs - gastos,
            });
          }
          for (const [id, ingresos] of prevIngresosMap.entries()) {
            if (!prevMap.has(id)) {
              prevMap.set(id, {
                mes: prevMonth,
                sucursalId: id,
                ingresos,
                cogs: 0,
                gastosTotales: 0,
                utilidadOperativa: ingresos,
              });
            }
          }
          for (const v of prevMap.values()) mergedPrev.push(v);
          setPreviousRow(mergedPrev.length ? aggregate(mergedPrev) : null);
        } else {
          setPreviousRow(null);
        }
      }

      // Historial (últimos 6 meses)
      const history = await loadHistory(sucursalId, filterMes);
      setHistoryRows(history);
    } catch (err: unknown) {
      console.error('Error cargando P&L', err);
      setRows([]);
      setPreviousRow(null);
      setHistoryRows([]);
      setError(getErrorMessage(err) ?? 'No fue posible obtener el estado de resultados.');
    } finally {
      setLoading(false);
    }
  }, [mes, selectedSucursal]);

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
   Historial (últimos 6)
--------------------------------------------------------------------------- */
const loadHistory = async (sucursalId: string | null, currentMesISO: string) => {
  try {
    let q = supabase
      .from('v_pyg_comparativo')
      .select('*')
      .lte('mes', currentMesISO)
      .order('mes', { ascending: true })
      .limit(6);

    if (sucursalId) q = q.eq('sucursal_id', sucursalId); // nunca usamos is.null

    const { data, error } = await q;
    if (error || !data) {
      if (error) console.warn('Error cargando v_pyg_comparativo', error);
      return [];
    }

    const normalized = normalize(data as PnLRawRow[]);
    if (!sucursalId) {
      // agregamos por mes (todas)
      const byMes = new Map<string, PnLRow[]>();
      for (const r of normalized) {
        const arr = byMes.get(r.mes) ?? [];
        arr.push(r);
        byMes.set(r.mes, arr);
      }
      const agg = Array.from(byMes.entries())
        .map(([mes, arr]) => ({ ...aggregate(arr), mes }))
        .sort((a, b) => a.mes.localeCompare(b.mes));
      return agg;
    }
    return normalized.sort((a, b) => a.mes.localeCompare(b.mes));
  } catch (err) {
    console.warn('Error inesperado cargando historial de P&L', err);
    return [];
  }
};

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
