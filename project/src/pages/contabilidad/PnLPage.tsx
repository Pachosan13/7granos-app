import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, TrendingDown, TrendingUp, Wallet, Wallet2 } from 'lucide-react';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { formatCurrencyUSD } from '../../lib/format';
import {
  formatDateIso,
  rpcWithFallback,
  toNumber,
  type RpcParams,
} from './rpcHelpers';
import {
  ToastContainer,
  createToast,
  dismissToast,
  type ToastItem,
} from '../../components/Toast';

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

const buildPostVariants = (mes: string, sucursalId: string | null): RpcParams[] => [
  { p_mes: mes, p_sucursal_id: sucursalId },
  { mes, p_sucursal_id: sucursalId },
  { mes, sucursal_id: sucursalId },
  { p_mes: mes, sucursal_id: sucursalId },
  { mes, sucursalId },
];

const normalize = (rows: PnLRawRow[]): PnLRow[] => {
  return rows.map((row) => {
    const mes = row.mes || row.periodo || '';
    const sucursalId =
      (row.sucursal_id ?? row.sucursalId ?? null) !== undefined
        ? (row.sucursal_id ?? row.sucursalId ?? null)
        : null;
    const ingresos = toNumber(row.ingresos);
    const cogs = toNumber(row.cogs);
    const gastosTotales = toNumber(
      row.gastos_totales ?? row.gastos ?? row.cogs ?? 0
    );
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
};

export const PnLPage = () => {
  const { sucursales, sucursalSeleccionada } = useAuthOrg();
  const [mes, setMes] = useState('');
  const [selectedSucursal, setSelectedSucursal] = useState('');
  const [rows, setRows] = useState<PnLRow[]>([]);
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

  const fetchData = useCallback(async () => {
    if (!mes) return;
    setLoading(true);
    setError(null);
    try {
      const filterMes = `${mes}-01`;
      const sucursalId = selectedSucursal || null;
      const data =
        (await rpcWithFallback<PnLRawRow[]>(
          'api_get_pyg',
          buildVariants(filterMes, sucursalId)
        )) ?? [];
      setRows(normalize(data));
    } catch (err: unknown) {
      console.error('Error cargando api_get_pyg', err);
      setRows([]);
      setError(getErrorMessage(err) ?? 'No fue posible obtener el estado de resultados.');
    } finally {
      setLoading(false);
    }
  }, [mes, selectedSucursal]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentRow = useMemo(() => rows[0] ?? null, [rows]);

  const totals = useMemo(() => {
    if (!currentRow) {
      return { ingresos: 0, cogs: 0, gastosTotales: 0, utilidadOperativa: 0 };
    }
    return currentRow;
  }, [currentRow]);

  const netMargin = useMemo(() => {
    if (!currentRow) return 0;
    if (currentRow.ingresos === 0) return 0;
    return ((currentRow.utilidadOperativa ?? 0) / currentRow.ingresos) * 100;
  }, [currentRow]);

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
      const result = await rpcWithFallback<PostJournalResult>(
        'api_post_journal_auto',
        buildPostVariants(filterMes, sucursalId)
      );
      const success =
        result?.ok ?? Boolean(result?.journal_id ?? result?.journalId);
      if (success) {
        pushToast({
          tone: 'success',
          title: 'Posteo completado',
          description:
            result?.msg ??
            'Se generó el journal automático para el mes seleccionado.',
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
        description: getErrorMessage(err) ?? 'Revisa la definición de la RPC en Supabase.',
      });
    } finally {
      setPosting(false);
    }
  }, [fetchData, mes, pushToast, selectedSucursal]);

  return (
    <div className="space-y-6">
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => dismissToast(setToasts, id)}
      />
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-bean">Estado de Resultados (P&amp;L)</h1>
          <p className="text-slate7g">
            Visualiza ingresos, COGS, gastos operativos y utilidad neta del mes.
          </p>
        </div>
        <button
          type="button"
          onClick={handlePostMes}
          disabled={posting || rows.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-white shadow disabled:opacity-60"
        >
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet2 size={16} />}
          {posting ? 'Posteando…' : 'Postear mes'}
        </button>
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

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wide">Ingresos</span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-800">
            {formatCurrencyUSD(totals.ingresos)}
          </p>
        </article>
        <article className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wide">COGS</span>
            <TrendingDown className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-800">
            {formatCurrencyUSD(totals.cogs)}
          </p>
        </article>
        <article className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wide">Gastos</span>
            <Wallet className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-800">
            {formatCurrencyUSD(totals.gastosTotales)}
          </p>
        </article>
        <article className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wide">Utilidad</span>
            <Wallet2 className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-800">
            {formatCurrencyUSD(totals.utilidadOperativa)}
          </p>
          <p className="text-xs text-slate-500">Margen neto: {netMargin.toFixed(1)}%</p>
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
        {!loading && rows.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            No hay datos para el mes seleccionado.
          </div>
        )}
        {error && (
          <div className="px-4 py-4 text-center text-sm text-rose-600">{error}</div>
        )}
      </section>
    </div>
  );
};

export default PnLPage;
