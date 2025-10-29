import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  ClipboardList,
  Loader2,
  PlayCircle,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as AuthOrgMod from '../../context/AuthOrgContext';
import { supabase, shouldUseDemoMode } from '../../lib/supabase';
import { formatDateDDMMYYYY } from '../../lib/format';

/* ────────────────────────────────────────────────────────────────────────────
   Contexto seguro
--------------------------------------------------------------------------- */
type Sucursal = { id: string; nombre: string };

type UseAuthOrgResult = {
  sucursales: Sucursal[];
  sucursalSeleccionada: Sucursal | null;
  setSucursalSeleccionada: (sucursal: Sucursal | null) => void;
};

type AuthOrgModule = {
  useAuthOrg?: () => UseAuthOrgResult;
  default?: () => UseAuthOrgResult;
};

const authOrgModule = AuthOrgMod as unknown as AuthOrgModule;

const useAuthOrg =
  authOrgModule.useAuthOrg ??
  authOrgModule.default ??
  (() => ({
    sucursales: [] as Sucursal[],
    sucursalSeleccionada: null as Sucursal | null,
    setSucursalSeleccionada: (sucursal: Sucursal | null) => {
      void sucursal;
    },
  }));

/* ────────────────────────────────────────────────────────────────────────────
   Tipos y helpers
--------------------------------------------------------------------------- */
type EstadoPeriodo = 'borrador' | 'calculado' | 'aprobado' | 'pagado';
interface Periodo {
  id: string;
  sucursal_id: string;
  periodo_mes: number;
  periodo_ano: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoPeriodo;
  created_at: string;
}

type PeriodoDetalle = {
  periodo_id?: string;
  empleado_id: string;
  empleado_nombre?: string | null;
  salario_base?: number | null;
  horas?: number | null;
  total?: number | null;
};

type PeriodoResumen = {
  total_empleados?: number | null;
  total_salarios?: number | null;
  total_deducciones?: number | null;
  total_neto?: number | null;
};

type DetalleSource = 'hr_periodo_detalle' | 'v_ui_periodo_detalle_resuelto';

declare global {
  interface Window {
    __DEMO_MODE__?: boolean;
  }
}

const DETAIL_COLUMNS = 'periodo_id, empleado_id, empleado_nombre, salario_base, horas, total';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const ESTADOS_LABELS: Record<EstadoPeriodo, string> = {
  borrador: 'Borrador',
  calculado: 'Calculado',
  aprobado: 'Aprobado',
  pagado: 'Pagado',
};
const ESTADOS_COLORS: Record<EstadoPeriodo, string> = {
  borrador: 'bg-gray-100 text-gray-800',
  calculado: 'bg-blue-100 text-blue-800',
  aprobado: 'bg-green-100 text-green-800',
  pagado: 'bg-purple-100 text-purple-800',
};

function getQueryParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function money(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

type NumericLike = number | string | null | undefined;

function sum<T extends Record<string, NumericLike>>(rows: T[], key: keyof T) {
  return rows.reduce((acc, row) => {
    const rawValue = row[key] as NumericLike;
    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0);
    return acc + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);
}

function formatHours(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getInitials(name: string | null | undefined) {
  if (!name) return '??';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('').padEnd(2, '•');
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch (stringifyError) {
    void stringifyError;
    return 'Error desconocido';
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Mock data (se activa solo si Supabase falla o viene vacío)
--------------------------------------------------------------------------- */
const mockPeriodo = (id: string, sucursal_id = 'demo-1'): Periodo => {
  const now = new Date();
  const mes = now.getMonth() + 1;
  const ano = now.getFullYear();
  const inicio = new Date(ano, mes - 1, 1);
  const fin = new Date(ano, mes - 1, 15);
  return {
    id,
    sucursal_id,
    periodo_mes: mes,
    periodo_ano: ano,
    fecha_inicio: inicio.toISOString(),
    fecha_fin: fin.toISOString(),
    estado: 'borrador',
    created_at: now.toISOString(),
  };
};

const mockDetalle: PeriodoDetalle[] = [
  { empleado_id: 'E-001', empleado_nombre: 'Juan Pérez', salario_base: 900, horas: 40, total: 900 },
  { empleado_id: 'E-002', empleado_nombre: 'María Gómez', salario_base: 850, horas: 38, total: 807.5 },
  { empleado_id: 'E-003', empleado_nombre: 'Carlos López', salario_base: 1000, horas: 42, total: 1050 },
];

const buildMockResumen = (detalle: PeriodoDetalle[]): PeriodoResumen => {
  const total_empleados = detalle.length;
  const total_salarios = detalle.reduce((s, r) => s + Number(r.salario_base ?? 0), 0);
  const total_deducciones = Math.round(total_salarios * 0.075 * 100) / 100; // demo 7.5%
  const total_neto = Math.round((total_salarios - total_deducciones) * 100) / 100;
  return { total_empleados, total_salarios, total_deducciones, total_neto };
};

/* ────────────────────────────────────────────────────────────────────────────
   Componente principal
--------------------------------------------------------------------------- */
export default function Calcular() {
  const navigate = useNavigate();
  const { sucursales, sucursalSeleccionada, setSucursalSeleccionada } = useAuthOrg();
  const periodoId = useMemo(() => getQueryParam('periodo'), []);
  const demoMode = useMemo(() => shouldUseDemoMode, []);

  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calculando, setCalculando] = useState(false);
  const [detalle, setDetalle] = useState<PeriodoDetalle[]>([]);
  const [detalleSource, setDetalleSource] = useState<DetalleSource>('hr_periodo_detalle');
  const [resumen, setResumen] = useState<PeriodoResumen | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [demoReason, setDemoReason] = useState<string | null>(null);
  const [resolvedViewAvailable, setResolvedViewAvailable] = useState<boolean | null>(null);
  const [resolvedViewStatus, setResolvedViewStatus] = useState<number | null>(null);

  // ✅ Una sola declaración: controla visibilidad del botón de sincronización
  const showSyncButton =
    import.meta.env.VITE_SHOW_SYNC_BUTTON === '1' ||
    (typeof window !== 'undefined' &&
      (localStorage.getItem('__7gr_admin') === '1' || window.location.search.includes('admin=1')));

  const totals = useMemo(
    () => ({
      salario: sum(detalle, 'salario_base'),
      horas: sum(detalle, 'horas'),
      total: sum(detalle, 'total'),
    }),
    [detalle]
  );

  // bandera global para que el Agent pueda detectar modo demo (opcional)
  useEffect(() => {
    window.__DEMO_MODE__ = isDemo;
  }, [isDemo]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sucursalSeleccionada && sucursales.length > 0) {
      const storedId = localStorage.getItem('selectedSucursalId');
      const fallback = storedId
        ? sucursales.find((s) => String(s.id) === String(storedId))
        : undefined;
      if (fallback) {
        setSucursalSeleccionada(fallback);
      }
    }
  }, [sucursalSeleccionada, sucursales, setSucursalSeleccionada]);

  const activateDemo = useCallback(
    (reason?: string) => {
      if (reason) {
        console.warn('[Calcular] Activando datos demo:', reason);
      }
      const fallbackPeriodoId = periodoId || 'periodo-demo';
      const fallbackSucursalId = sucursalSeleccionada?.id ?? 'demo-1';
      const demoPeriodo = mockPeriodo(fallbackPeriodoId, fallbackSucursalId);
      setPeriodo(demoPeriodo);
      setDetalle(mockDetalle);
      setDetalleSource('hr_periodo_detalle');
      setResumen(buildMockResumen(mockDetalle));
      setIsDemo(true);
      setDemoReason(reason ?? null);
      setError('');
    },
    [periodoId, sucursalSeleccionada?.id]
  );

  const checkResolvedViewAvailability = useCallback(async (periodoIdToCheck: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    if (!supabaseUrl || !supabaseAnonKey || typeof fetch === 'undefined') {
      setResolvedViewAvailable(false);
      setResolvedViewStatus(null);
      return false;
    }

    try {
      const endpoint =
        `${supabaseUrl}/rest/v1/v_ui_periodo_detalle_resuelto?periodo_id=eq.${encodeURIComponent(
          periodoIdToCheck
        )}&select=periodo_id&limit=1`;
      const response = await fetch(endpoint, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
      });
      setResolvedViewStatus(response.status);
      if (response.ok) {
        setResolvedViewAvailable(true);
        return true;
      }
      setResolvedViewAvailable(false);
      return false;
    } catch (error) {
      console.warn('[Calcular] No se pudo verificar la vista resuelta', error);
      setResolvedViewAvailable(false);
      setResolvedViewStatus(null);
      return false;
    }
  }, []);

  /* ── Cargar período y detalle ─────────────────────────────────────────── */
  const loadPeriodo = useCallback(async () => {
    try {
      if (!periodoId) {
        setError('Falta el parámetro ?periodo=');
        setLoading(false);
        setIsDemo(false);
        setDemoReason(null);
        setDetalle([]);
        setResumen(null);
        return;
      }
      setLoading(true);
      setError('');
      setIsDemo(false);
      setDemoReason(null);
      setDetalle([]);
      setResumen(null);
      setDetalleSource('hr_periodo_detalle');

      if (demoMode) {
        activateDemo('Supabase no configurado (shouldUseDemoMode=TRUE)');
        setLoading(false);
        return;
      }

      const { data: pData, error: pErr } = await supabase
        .from('hr_periodo')
        .select('*')
        .eq('id', periodoId)
        .single();

      if (pErr) throw pErr;
      if (!pData) throw new Error('No se encontró el período');

      setPeriodo(pData as Periodo);

      const { data: baseData, error: baseErr } = await supabase
        .from('hr_periodo_detalle')
        .select(DETAIL_COLUMNS)
        .eq('periodo_id', periodoId)
        .order('empleado_nombre', { ascending: true });

      if (baseErr && baseErr.code !== '42P01') throw baseErr;
      if (baseErr?.code === '42P01') throw baseErr;

      let finalRows = (baseData ?? []) as PeriodoDetalle[];
      let finalSource: DetalleSource = 'hr_periodo_detalle';

      let canUseResolvedView = resolvedViewAvailable === true;
      if (!canUseResolvedView) {
        canUseResolvedView = await checkResolvedViewAvailability(periodoId);
      }

      if (canUseResolvedView) {
        const { data: viewData, error: viewErr } = await supabase
          .from('v_ui_periodo_detalle_resuelto')
          .select(DETAIL_COLUMNS)
          .eq('periodo_id', periodoId);

        if (viewErr && viewErr.code !== '42P01') {
          console.warn('[Calcular] Error al usar v_ui_periodo_detalle_resuelto, se mantiene la tabla base', viewErr);
          setResolvedViewAvailable(false);
        } else if (viewData) {
          finalRows = viewData as PeriodoDetalle[];
          finalSource = 'v_ui_periodo_detalle_resuelto';
        }
      }

      setDetalle(finalRows);
      setDetalleSource(finalSource);

      const { data: resumenData, error: resErr } = await supabase
        .from('v_ui_resumen_planilla')
        .select('*')
        .eq('periodo_id', periodoId)
        .maybeSingle();

      if (resErr && resErr.code !== '42P01') throw resErr;

      if (resumenData) {
        setResumen(resumenData as PeriodoResumen);
      } else if (finalRows.length > 0) {
        setResumen(buildMockResumen(finalRows));
      } else {
        setResumen(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[Calcular] Fallback demo activado:', message);
      activateDemo(message);
    } finally {
      setLoading(false);
    }
  }, [
    activateDemo,
    checkResolvedViewAvailability,
    demoMode,
    periodoId,
    resolvedViewAvailable,
  ]);

  useEffect(() => void loadPeriodo(), [loadPeriodo]);

  /* ── Calcular planilla (RPC) ───────────────────────────────────────────── */
  const handleCalcular = useCallback(async () => {
    if (!periodo) return;
    setCalculando(true);
    setError('');

    try {
      // 1) Intenta RPC real si existe
      const { error: rpcErr } = await supabase.rpc('rpc_hr_calcular_periodo', {
        p_periodo_id: periodo.id,
      });
      if (!rpcErr) {
        await loadPeriodo();
        return;
      }

      // 2) Fallback "seguro" desde el cliente
      const { data: empleados } = await supabase
        .from('hr_empleado')
        .select('id, nombre, salario_base, sucursal_id')
        .limit(200);

      await supabase.from('hr_periodo_detalle').delete().eq('periodo_id', periodo.id);

      let rows: PeriodoDetalle[] = [];

      if (empleados && empleados.length) {
        const filtrados = empleados.filter((e) =>
          !periodo.sucursal_id ? true : String(e.sucursal_id) === String(periodo.sucursal_id)
        );
        rows = (filtrados.length ? filtrados : empleados).map((e) => ({
          periodo_id: periodo.id,
          empleado_id: String(e.id),
          empleado_nombre: e.nombre ?? e.id,
          salario_base: Number(e.salario_base ?? 0),
          horas: 40,
          total: Number(e.salario_base ?? 0),
        }));
      } else {
        // demo mínimo si no hay maestro
        rows = [
          {
            periodo_id: periodo.id,
            empleado_id: 'E-001',
            empleado_nombre: 'Juan Pérez',
            salario_base: 900,
            horas: 40,
            total: 900,
          },
          {
            periodo_id: periodo.id,
            empleado_id: 'E-002',
            empleado_nombre: 'María Gómez',
            salario_base: 850,
            horas: 38,
            total: 807.5,
          },
          {
            periodo_id: periodo.id,
            empleado_id: 'E-003',
            empleado_nombre: 'Carlos López',
            salario_base: 1000,
            horas: 42,
            total: 1050,
          },
        ];
      }

      if (rows.length) {
        const { error: insErr } = await supabase.from('hr_periodo_detalle').insert(rows);
        if (insErr) throw insErr;
      }

      await loadPeriodo();
    } catch (error) {
      console.error('[Calcular] fallback error', error);
      setError(getErrorMessage(error));
    } finally {
      setCalculando(false);
    }
  }, [periodo, loadPeriodo]);

  /* ── Cambio de sucursal ───────────────────────────────────────────────── */
  function handleChangeSucursal(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value;
    const nueva = sucursales.find((s) => String(s.id) === String(newId));
    if (nueva) {
      setSucursalSeleccionada(nueva);
      localStorage.setItem('selectedSucursalId', nueva.id);
    }
    navigate('/payroll');
  }

  const BackBar: React.FC = () => {
    const goBack = () => {
      if (window.history.length > 1) window.history.back();
      else navigate('/payroll');
    };
    return (
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 shadow hover:bg-gray-50"
            title="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver</span>
          </button>
          <a
            href="/payroll"
            className="text-sm text-slate-600 underline underline-offset-4 transition hover:text-slate-900"
            title="Ver períodos"
          >
            Ir a períodos
          </a>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-lg border bg-gray-50 px-3 py-2 text-gray-700">
            <Building2 className="mr-2 h-4 w-4" />
            <span className="text-sm">{sucursalSeleccionada?.nombre ?? 'Sin sucursal'}</span>
          </div>
          {sucursales.length > 0 && (
            <select
              value={sucursalSeleccionada?.id ?? ''}
              onChange={handleChangeSucursal}
              className="rounded-lg border bg-white px-3 py-2 text-sm"
              title="Cambiar sucursal"
            >
              {sucursales.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  };

  /* ── UI ────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 p-6">
      <BackBar />

      {loading ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-accent" />
          <p>Cargando período…</p>
        </div>
      ) : error && !isDemo ? (
        <div className="rounded-xl border-l-4 border-red-500 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">{error}</span>
          </div>
        </div>
      ) : !periodo ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow">
          <p>No se encontró el período solicitado.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {isDemo && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-800">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">
                Mostrando datos de ejemplo (modo demo). Intenta «Refrescar» para reconectar con Supabase.
                {demoReason ? ` (${demoReason})` : ''}
              </span>
            </div>
          )}

          {/* Header período + acciones */}
          <div className="rounded-2xl border bg-white p-6 shadow">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  {MESES[periodo.periodo_mes - 1]} {periodo.periodo_ano}
                </h2>
                <p className="text-gray-600">
                  {formatDateDDMMYYYY(periodo.fecha_inicio)} — {formatDateDDMMYYYY(periodo.fecha_fin)}
                </p>
                <div className="mt-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${ESTADOS_COLORS[periodo.estado]}`}>
                    {ESTADOS_LABELS[periodo.estado]}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleCalcular}
                  disabled={calculando}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow disabled:opacity-50"
                >
                  <PlayCircle className={`h-5 w-5 ${calculando ? 'animate-spin' : ''}`} />
                  {calculando ? 'Calculando…' : 'Calcular planilla'}
                </button>

                <button
                  onClick={loadPeriodo}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border hover:bg-gray-50 shadow"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refrescar
                </button>

                {showSyncButton && (
                  <button
                    onClick={async () => {
                  try {
                    const sucursalId =
                      (sucursalSeleccionada?.id || (periodo as any)?.sucursal_id) as string | undefined;
                
                    const { data, error } = await supabase.functions.invoke('sync-empleados', {
                      body: sucursalId ? { sucursal_id: sucursalId } : {},
                    });
                    if (error) throw error;
                
                    console.log('Empleados sincronizados:', data);
                    await loadPeriodo();
                    alert('✅ Empleados sincronizados');
                  } catch (e: any) {
                    console.error(e);
                    alert(`❌ Error al sincronizar: ${e?.message || e}`);
                  }
                }}

                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border bg-white hover:bg-gray-50 shadow"
                    title="Sincronizar empleados desde INVU"
                  >
                    <Loader2 className="h-4 w-4" />
                    Sincronizar empleados
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Empleados del período */}
          <div className="rounded-2xl border bg-white p-6 shadow">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <h3 className="text-xl font-semibold">Empleados del período</h3>
              <span className="text-xs uppercase tracking-wide text-slate-400">
                Fuente: {detalleSource === 'v_ui_periodo_detalle_resuelto' ? 'Vista resuelta' : 'Tabla base ordenada'}
                {resolvedViewStatus && ` (REST ${resolvedViewStatus})`}
              </span>
            </div>

            {detalle.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-inner">
                  <ClipboardList className="h-8 w-8 text-slate-400" />
                </div>
                <h4 className="text-lg font-semibold text-slate-700">Sin cálculos todavía</h4>
                <p className="mt-2 max-w-sm text-sm text-slate-500">
                  Ejecuta el cálculo para generar los detalles de empleados y visualizar la planilla completa.
                </p>
                <button
                  onClick={handleCalcular}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-purple-700"
                >
                  <PlayCircle className="h-4 w-4" />
                  Calcular planilla
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full table-fixed text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur">
                      <tr className="text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-6 py-3 text-left font-semibold">Empleado</th>
                        <th className="px-6 py-3 text-right font-semibold">Salario base</th>
                        <th className="px-6 py-3 text-right font-semibold">Horas</th>
                        <th className="px-6 py-3 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detalle.map((row, index) => (
                        <tr
                          key={`${row.empleado_id ?? index}-${index}`}
                          className={index % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600">
                                {getInitials(row.empleado_nombre || row.empleado_id)}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">
                                  {row.empleado_nombre ?? 'Empleado sin nombre'}
                                </div>
                                <div className="text-xs text-slate-500">{row.empleado_id ?? 'ID no disponible'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-slate-700">{money(row.salario_base)}</td>
                          <td className="px-6 py-4 text-right text-slate-600">{formatHours(row.horas)}</td>
                          <td className="px-6 py-4 text-right text-sm font-semibold text-slate-900">{money(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900 text-slate-50">
                        <td className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wide">Totales</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold">{money(totals.salario)}</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold">{formatHours(totals.horas)}</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold">{money(totals.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Resumen de totales */}
          {resumen && (
            <div className="rounded-2xl border bg-white p-6 shadow">
              <h3 className="mb-4 text-xl font-semibold">Resumen de totales</h3>
              <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                <div>
                  <div className="text-sm text-gray-500">Empleados</div>
                  <div className="text-lg font-semibold">{resumen.total_empleados ?? '—'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Salarios</div>
                  <div className="text-lg font-semibold">{money(resumen.total_salarios)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Deducciones</div>
                  <div className="text-lg font-semibold">{money(resumen.total_deducciones)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Total Neto</div>
                  <div className="text-lg font-semibold">{money(resumen.total_neto)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
