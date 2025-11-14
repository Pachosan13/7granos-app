import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { supabase } from '../../lib/supabase';
import {
  ToastContainer,
  createToast,
  dismissToast,
  type ToastItem,
} from '../../components/Toast';
import {
  rpcWithFallback,
  type RpcParams,
} from './rpcHelpers';
import {
  getMonthBounds,
} from './glData';
import { postJournalsInRange } from '../../lib/contabilidad';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Error desconocido';
};

type BlockKey = 'ventas' | 'compras' | 'cogs' | 'gastos' | 'cierre';
type BlockStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'ERROR';

interface BlockCardState {
  status: BlockStatus;
  lastRun: string | null;
  message: string | null;
}

interface JournalStatusRow {
  source?: string | null;
  created_at?: string | null;
  journal_date?: string | null;
  sucursal_id?: string | null;
}

interface PendingJournalRow extends JournalStatusRow {
  status?: string | null;
  posted_at?: string | null;
}

const SOURCE_GROUPS: Record<BlockKey, string[]> = {
  ventas: ['venta', 'ventas', 'sale', 'sales'],
  compras: ['compra', 'compras', 'purchase', 'ap'],
  cogs: ['cogs', 'cost', 'cost_of_goods', 'inventario', 'inventory'],
  gastos: ['gasto', 'gastos', 'expense', 'expenses'],
  cierre: ['cierre', 'closing', 'close', 'posteo'],
};

const BLOCKS: Array<{
  key: BlockKey;
  title: string;
  description: string;
  actionLabel: string;
}> = [
  {
    key: 'ventas',
    title: 'Ventas',
    description: 'Genera y postea las ventas provenientes del POS y canales digitales.',
    actionLabel: 'Postear ventas del mes',
  },
  {
    key: 'compras',
    title: 'Compras',
    description: 'Integra las compras y facturas de proveedores para el periodo seleccionado.',
    actionLabel: 'Postear compras del mes',
  },
  {
    key: 'cogs',
    title: 'COGS',
    description: 'Calcula el costo de ventas según política configurada para la sucursal.',
    actionLabel: 'Postear COGS del mes',
  },
  {
    key: 'gastos',
    title: 'Gastos',
    description: 'Registra los gastos operativos y fijos asociados al periodo.',
    actionLabel: 'Postear gastos del mes',
  },
  {
    key: 'cierre',
    title: 'Cierre contable',
    description: 'Publica los journals consolidados y cierra el periodo contable.',
    actionLabel: 'Cerrar mes (post journals)',
  },
];

const buildMonthVariants = (mes: string, sucursalId: string | null): RpcParams[] => [
  { p_mes: mes, p_sucursal_id: sucursalId },
  { mes, p_sucursal_id: sucursalId },
  { mes, sucursal_id: sucursalId },
  { p_mes: mes, sucursal_id: sucursalId },
  { mes, sucursalId },
];

const matchesSource = (value: string | null | undefined, aliases: string[]) => {
  const normalized = (value ?? '').toLowerCase();
  if (!normalized) return false;
  return aliases.some((alias) => normalized.includes(alias));
};

const normalizeTimestamp = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const deriveBlockState = (
  key: BlockKey,
  posted: JournalStatusRow[],
  staging: PendingJournalRow[]
): BlockCardState => {
  const aliases = SOURCE_GROUPS[key];
  const postedMatches = posted.filter((row) => matchesSource(row.source, aliases));
  const stagingMatches = staging.filter((row) => matchesSource(row.source, aliases));

  const hasError = stagingMatches.some((row) => {
    const status = (row.status ?? '').toLowerCase();
    return status.includes('error') || status.includes('fail');
  });

  const timestamps: string[] = [];
  postedMatches.forEach((row) => {
    const ts = normalizeTimestamp(row.created_at ?? row.journal_date ?? null);
    if (ts) timestamps.push(ts);
  });
  stagingMatches.forEach((row) => {
    const ts = normalizeTimestamp(row.posted_at ?? row.created_at ?? row.journal_date ?? null);
    if (ts) timestamps.push(ts);
  });

  const lastRun = timestamps.length
    ? new Date(
        Math.max(
          ...timestamps
            .map((value) => new Date(value).getTime())
            .filter((time) => Number.isFinite(time))
        )
      ).toISOString()
    : null;

  if (hasError) {
    return { status: 'ERROR', lastRun, message: 'Revisa los journals pendientes con error.' };
  }
  if (postedMatches.length > 0) {
    return { status: 'DONE', lastRun, message: null };
  }
  if (stagingMatches.length > 0) {
    return { status: 'IN_PROGRESS', lastRun, message: null };
  }
  return { status: 'NOT_STARTED', lastRun, message: null };
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-PA', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const StatusBadge = ({ status }: { status: BlockStatus }) => {
  const config: Record<BlockStatus, { label: string; tone: string; icon: JSX.Element }> = {
    NOT_STARTED: {
      label: 'Pendiente',
      tone: 'bg-slate-100 text-slate-600',
      icon: <Clock3 className="h-4 w-4" />,
    },
    IN_PROGRESS: {
      label: 'En progreso',
      tone: 'bg-amber-100 text-amber-700',
      icon: <RefreshCw className="h-4 w-4 animate-spin" />,
    },
    DONE: {
      label: 'Listo',
      tone: 'bg-emerald-100 text-emerald-700',
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    ERROR: {
      label: 'Error',
      tone: 'bg-rose-100 text-rose-700',
      icon: <AlertCircle className="h-4 w-4" />,
    },
  };
  const cfg = config[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${cfg.tone}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

export const ProWorkflowPage = () => {
  const { sucursales, sucursalSeleccionada } = useAuthOrg();
  const [mes, setMes] = useState('');
  const [selectedSucursal, setSelectedSucursal] = useState('');
  const [blockStates, setBlockStates] = useState<Record<BlockKey, BlockCardState>>({
    ventas: { status: 'NOT_STARTED', lastRun: null, message: null },
    compras: { status: 'NOT_STARTED', lastRun: null, message: null },
    cogs: { status: 'NOT_STARTED', lastRun: null, message: null },
    gastos: { status: 'NOT_STARTED', lastRun: null, message: null },
    cierre: { status: 'NOT_STARTED', lastRun: null, message: null },
  });
  const [statusLoading, setStatusLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<BlockKey, boolean>>({
    ventas: false,
    compras: false,
    cogs: false,
    gastos: false,
    cierre: false,
  });
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

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => createToast(setToasts, toast),
    []
  );

  const fetchStatuses = useCallback(async () => {
    if (!mes) return;
    setStatusLoading(true);
    try {
      const monthISO = `${mes}-01`;
      const { start, end } = getMonthBounds(monthISO);
      const sucursalId = selectedSucursal || null;

      const postedQuery = supabase
        .from('contabilidad_journal')
        .select('id, source, journal_date, created_at, sucursal_id')
        .gte('journal_date', start)
        .lte('journal_date', end);
      const stagingQuery = supabase
        .from('cont_journal')
        .select('id, source, journal_date, created_at, posted_at, status, sucursal_id')
        .gte('journal_date', start)
        .lte('journal_date', end);

      if (sucursalId) {
        postedQuery.eq('sucursal_id', sucursalId);
        stagingQuery.eq('sucursal_id', sucursalId);
      }

      const [{ data: postedData, error: postedError }, { data: stagingData, error: stagingError }] =
        await Promise.all([postedQuery, stagingQuery]);

      if (postedError) throw postedError;
      if (stagingError) throw stagingError;

      const posted = (postedData as JournalStatusRow[] | null) ?? [];
      const staging = (stagingData as PendingJournalRow[] | null) ?? [];

      setBlockStates((prev) => {
        const next: Record<BlockKey, BlockCardState> = { ...prev };
        (Object.keys(next) as BlockKey[]).forEach((key) => {
          next[key] = deriveBlockState(key, posted, staging);
        });
        return next;
      });
    } catch (err: unknown) {
      console.error('Error consultando estado de posteo', err);
      setBlockStates((prev) => {
        const next: Record<BlockKey, BlockCardState> = { ...prev };
        (Object.keys(next) as BlockKey[]).forEach((key) => {
          next[key] = {
            status: 'ERROR',
            lastRun: prev[key]?.lastRun ?? null,
            message: getErrorMessage(err),
          };
        });
        return next;
      });
    } finally {
      setStatusLoading(false);
    }
  }, [mes, selectedSucursal]);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const ensureCogsPolicy = useCallback(async (sucursalId: string | null) => {
    if (!sucursalId) return null;
    const { data, error } = await supabase
      .from('cont_cogs_policy')
      .select('mode')
      .eq('sucursal_id', sucursalId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    return data?.mode ? String(data.mode).toLowerCase() : null;
  }, []);

  const runVentas = useCallback(
    async (monthISO: string, sucursalId: string | null) => {
      await rpcWithFallback('cont_create_sales_journal', buildMonthVariants(monthISO, sucursalId));
      await rpcWithFallback('cont_post_sales_from_norm_view', buildMonthVariants(monthISO, sucursalId));
    },
    []
  );

  const runCompras = useCallback(
    async (monthISO: string, sucursalId: string | null) => {
      await rpcWithFallback('cont_post_purchases', buildMonthVariants(monthISO, sucursalId));
    },
    []
  );

  const runGastos = useCallback(
    async (monthISO: string, sucursalId: string | null) => {
      await rpcWithFallback('cont_post_expenses', buildMonthVariants(monthISO, sucursalId));
    },
    []
  );

  const runCogs = useCallback(
    async (monthISO: string, sucursalId: string | null) => {
      const mode = await ensureCogsPolicy(sucursalId);
      if (mode === 'percent' || mode === 'percentage') {
        await rpcWithFallback('cont_create_cogs_percent_journal', buildMonthVariants(monthISO, sucursalId));
        await rpcWithFallback('cont_post_cogs', buildMonthVariants(monthISO, sucursalId));
        return;
      }
      try {
        await rpcWithFallback('cont_post_cogs_from_inv', buildMonthVariants(monthISO, sucursalId));
      } catch (error) {
        console.warn('cont_post_cogs_from_inv falló, usando cont_post_cogs', error);
        await rpcWithFallback('cont_post_cogs', buildMonthVariants(monthISO, sucursalId));
      }
    },
    [ensureCogsPolicy]
  );

  const runCierre = useCallback(
    async (monthISO: string, sucursalId: string | null) => {
      const { start, end } = getMonthBounds(monthISO);
      await postJournalsInRange({ desde: start, hasta: end, sucursalId });
    },
    []
  );

  const handleAction = useCallback(
    async (block: BlockKey) => {
      if (!mes) return;
      const monthISO = `${mes}-01`;
      const sucursalId = selectedSucursal || null;

      setActionLoading((prev) => ({ ...prev, [block]: true }));
      try {
        switch (block) {
          case 'ventas':
            await runVentas(monthISO, sucursalId);
            break;
          case 'compras':
            await runCompras(monthISO, sucursalId);
            break;
          case 'cogs':
            await runCogs(monthISO, sucursalId);
            break;
          case 'gastos':
            await runGastos(monthISO, sucursalId);
            break;
          case 'cierre':
            await runCierre(monthISO, sucursalId);
            break;
          default:
            break;
        }
        pushToast({
          tone: 'success',
          title: 'Proceso completado',
          description: 'La acción solicitada se ejecutó correctamente.',
        });
        await fetchStatuses();
      } catch (err: unknown) {
        console.error('Error ejecutando proceso contable', err);
        pushToast({
          tone: 'error',
          title: 'No se pudo completar la acción',
          description: getErrorMessage(err),
        });
        setBlockStates((prev) => ({
          ...prev,
          [block]: {
            status: 'ERROR',
            lastRun: prev[block]?.lastRun ?? null,
            message: getErrorMessage(err),
          },
        }));
      } finally {
        setActionLoading((prev) => ({ ...prev, [block]: false }));
      }
    },
    [fetchStatuses, mes, pushToast, runCierre, runCogs, runCompras, runGastos, runVentas, selectedSucursal]
  );

  const readyToClose = useMemo(
    () =>
      ['ventas', 'compras', 'cogs', 'gastos'].every(
        (key) => blockStates[key as BlockKey]?.status === 'DONE'
      ),
    [blockStates]
  );

  const headerSubtitle = useMemo(() => {
    if (!mes) return 'Selecciona un mes para comenzar el cierre contable.';
    return `Ciclo contable para ${mes}`;
  }, [mes]);

  return (
    <div className="space-y-6">
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => dismissToast(setToasts, id)}
      />

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-bean">Contabilidad PRO · Cierre mensual</h1>
        <p className="text-slate7g">{headerSubtitle}</p>
        {statusLoading && (
          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Actualizando estado…
          </span>
        )}
      </header>

      <section className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
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
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <button
            type="button"
            onClick={fetchStatuses}
            className="inline-flex items-center gap-2 rounded-lg border border-sand px-3 py-1 text-sm text-bean hover:border-bean"
          >
            <RefreshCw className="h-4 w-4" /> Refrescar estado
          </button>
          <div className="inline-flex items-center gap-2 text-slate-600">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Todos los procesos se ejecutan vía RPC seguras en Supabase.
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {BLOCKS.map((block) => {
          const state = blockStates[block.key];
          const running = actionLoading[block.key];
          const disabled =
            running ||
            statusLoading ||
            (block.key === 'cierre' && !readyToClose);
          return (
            <article
              key={block.key}
              className="flex h-full flex-col justify-between rounded-2xl border border-sand bg-white p-5 shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">{block.title}</h2>
                    <p className="text-sm text-slate-500">{block.description}</p>
                  </div>
                  <StatusBadge status={state?.status ?? 'NOT_STARTED'} />
                </div>
                <dl className="space-y-1 text-sm text-slate-500">
                  <div className="flex justify-between">
                    <dt>Última ejecución</dt>
                    <dd className="font-medium text-slate-700">
                      {formatDateTime(state?.lastRun ?? null)}
                    </dd>
                  </div>
                  {block.key === 'cierre' && (
                    <div className="flex justify-between">
                      <dt>Prerequisitos</dt>
                      <dd className="font-medium text-slate-700">
                        {readyToClose ? 'Listo para cerrar' : 'Completa ventas, compras, COGS y gastos'}
                      </dd>
                    </div>
                  )}
                </dl>
                {state?.message && (
                  <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5" /> {state.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleAction(block.key)}
                disabled={disabled}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {block.actionLabel}
              </button>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-dashed border-sand bg-off/40 p-6 text-sm text-slate-600">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-bean" />
            <div>
              <p className="font-semibold text-slate-800">Checklist recomendado</p>
              <p>
                Ejecuta los procesos en orden y valida el estado antes de continuar con el cierre. Si ocurre un error, revisa el
                journal correspondiente en Contabilidad &gt; Diario.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchStatuses}
            className="inline-flex items-center gap-2 rounded-lg border border-bean px-3 py-1 text-sm text-bean hover:bg-bean/5"
          >
            <RefreshCw className="h-4 w-4" /> Verificar nuevamente
          </button>
        </div>
      </section>
    </div>
  );
};

export default ProWorkflowPage;
