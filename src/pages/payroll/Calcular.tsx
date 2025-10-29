// src/pages/payroll/Calcular.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PlayCircle,
  RefreshCw,
  UserCog,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as AuthOrgMod from '../../context/AuthOrgContext';
import { supabase } from '../../lib/supabase';
import { formatDateDDMMYYYY } from '../../lib/format';

/* ────────────────────────────────────────────────────────────────────────────
   Contexto seguro
--------------------------------------------------------------------------- */
type Sucursal = { id: string; nombre: string };
const useAuthOrg =
  (AuthOrgMod as any).useAuthOrg ??
  (() => ({
    sucursales: [] as Sucursal[],
    sucursalSeleccionada: null as Sucursal | null,
    setSucursalSeleccionada: (_: Sucursal | null) => {},
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

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
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

function sum<T extends Record<string, any>>(rows: T[], key: keyof T) {
  return rows.reduce((acc, row) => acc + Number(row?.[key] ?? 0), 0);
}

function getInitials(name: string | null | undefined) {
  if (!name) return '??';
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return parts
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
    .padEnd(2, '•');
}

/* ────────────────────────────────────────────────────────────────────────────
   Componente principal
--------------------------------------------------------------------------- */
export default function Calcular() {
  const navigate = useNavigate();
  const { sucursales, sucursalSeleccionada, setSucursalSeleccionada } = useAuthOrg();
  const periodoId = useMemo(() => getQueryParam('periodo'), []);

  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calculando, setCalculando] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSyncButton, setShowSyncButton] = useState(false);
  const [syncMessage, setSyncMessage] = useState<
    | {
        type: 'success' | 'error';
        message: string;
      }
    | null
  >(null);
  const [detalle, setDetalle] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any>(null);

  const totals = useMemo(
    () => ({
      salario: sum(detalle, 'salario_base'),
      horas: sum(detalle, 'horas'),
      total: sum(detalle, 'total'),
    }),
    [detalle]
  );

  useEffect(() => {
    const envFlag = String((import.meta as any).env?.VITE_SHOW_SYNC_BUTTON ?? '');
    if (envFlag === '1') {
      setShowSyncButton(true);
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search ?? '');
      const localAdmin = window.localStorage.getItem('__7gr_admin');
      if (params.get('admin') === '1' || params.get('preview') === '1' || localAdmin === '1') {
        setShowSyncButton(true);
      }
    } catch (err) {
      console.warn('No se pudo determinar el modo admin/preview', err);
    }
  }, []);

  useEffect(() => {
    if (!syncMessage) return;
    const timer = window.setTimeout(() => setSyncMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [syncMessage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sucursalSeleccionada && sucursales.length > 0 && typeof setSucursalSeleccionada === 'function') {
      const storedId = localStorage.getItem('selectedSucursalId');
      const fallback = sucursales.find((s) => String(s.id) === String(storedId));
      if (fallback) {
        setSucursalSeleccionada(fallback);
      }
    }
  }, [sucursalSeleccionada, sucursales, setSucursalSeleccionada]);

  /* ── Cargar período y detalle ─────────────────────────────────────────── */
  const loadPeriodo = useCallback(async () => {
    try {
      if (!periodoId) {
        setError('Falta el parámetro ?periodo=');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');

      const { data: pData, error: pErr } = await supabase
        .from('hr_periodo')
        .select('*')
        .eq('id', periodoId)
        .single();

      if (pErr) throw pErr;
      setPeriodo(pData as Periodo);

      // Intentar cargar empleados o líneas si existen
      let detalleData: any[] | null = null;
      let detalleError: any = null;

      const { data: viewData, error: viewErr } = await supabase
        .from('v_ui_periodo_detalle')
        .select('*')
        .eq('periodo_id', periodoId)
        .order('empleado_nombre', { ascending: true });

      if (viewErr && viewErr.code !== '42P01') {
        detalleError = viewErr;
      } else if (viewErr?.code === '42P01') {
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('hr_periodo_detalle')
          .select('*')
          .eq('periodo_id', periodoId)
          .order('empleado_nombre', { ascending: true });
        detalleData = fallbackData ?? [];
        detalleError = fallbackErr;
      } else {
        detalleData = viewData ?? [];
      }

      if (detalleError && detalleError.code !== '42P01') throw detalleError;

      setDetalle(detalleData ?? []);

      // Cargar resumen si existe vista
      const { data: resumenData } = await supabase
        .from('v_ui_resumen_planilla')
        .select('*')
        .eq('periodo_id', periodoId)
        .maybeSingle();
      setResumen(resumenData ?? null);
    } catch (e: any) {
      console.error('[Calcular] loadPeriodo error', e);
      setError(e?.message ?? 'Error cargando período');
    } finally {
      setLoading(false);
    }
  }, [periodoId]);

  useEffect(() => void loadPeriodo(), [loadPeriodo]);

  /* ── Calcular planilla (RPC) ───────────────────────────────────────────── */
  const handleCalcular = useCallback(async () => {
    try {
      if (!periodo) return;
      setCalculando(true);
      setError('');

      // Reemplaza por tu RPC real si ya existe:
      // const { error } = await supabase.rpc('rpc_hr_calcular_periodo', { p_periodo_id: periodo.id });
      // if (error) throw error;

      await new Promise((r) => setTimeout(r, 800)); // Simulación
      await loadPeriodo();
    } catch (e: any) {
      console.error('[Calcular] calcular error', e);
      setError(e?.message ?? 'Error al calcular');
    } finally {
      setCalculando(false);
    }
  }, [periodo, loadPeriodo]);

  /* ── Sincronizar empleados ────────────────────────────────────────────── */
  const handleSyncEmpleados = useCallback(async () => {
    if (syncing) return;
    setSyncMessage(null);
    try {
      setSyncing(true);
      const env = (import.meta as any).env ?? {};
      const baseUrl = String(env.VITE_SUPABASE_FUNCTIONS_URL ?? '').replace(/\/$/, '');
      const anonKey = String(env.VITE_SUPABASE_ANON_KEY ?? '');

      if (!baseUrl || !anonKey) {
        throw new Error('Configura VITE_SUPABASE_FUNCTIONS_URL y VITE_SUPABASE_ANON_KEY.');
      }

      const targetSucursalId = sucursalSeleccionada?.id ?? periodo?.sucursal_id ?? null;

      const response = await fetch(`${baseUrl}/sync_empleados`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
        },
        body: targetSucursalId ? JSON.stringify({ sucursal_id: targetSucursalId }) : undefined,
      });

      const payload = await response.json().catch(() => ({}));
      const ok = response.ok && (payload?.ok ?? true) !== false;

      if (!ok) {
        const message = payload?.error ?? `Error ${response.status}`;
        throw new Error(String(message));
      }

      setSyncMessage({ type: 'success', message: 'Empleados sincronizados correctamente.' });
      await loadPeriodo();
    } catch (err: any) {
      console.error('[Calcular] sync_empleados error', err);
      const message = err?.message ?? 'Error al sincronizar empleados.';
      setSyncMessage({ type: 'error', message });
    } finally {
      setSyncing(false);
    }
  }, [syncing, sucursalSeleccionada?.id, periodo?.sucursal_id, loadPeriodo]);

  /* ── Cambio de sucursal ───────────────────────────────────────────────── */
  function handleChangeSucursal(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value;
    const nueva = sucursales.find((s) => String(s.id) === String(newId));
    if (nueva && typeof setSucursalSeleccionada === 'function') {
      setSucursalSeleccionada(nueva);
      localStorage.setItem('selectedSucursalId', nueva.id);
    }
    navigate('/payroll');
  }

  /* ── Header reutilizable: back + link fijo ─────────────────────────────── */
  const BackBar: React.FC = () => {
    const goBack = () => {
      if (window.history.length > 1) window.history.back();
      else navigate('/payroll');
    };
    return (
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-white hover:bg-gray-50 shadow"
            title="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver</span>
          </button>
          <a
            href="/payroll"
            className="ml-2 text-sm text-slate-600 hover:text-slate-900 underline"
            title="Ir a Periodos"
          >
            Ir a Periodos
          </a>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center px-3 py-2 rounded-lg border bg-gray-50 text-gray-700">
            <Building2 className="h-4 w-4 mr-2" />
            <span className="text-sm">
              {sucursalSeleccionada?.nombre ?? 'Sin sucursal'}
            </span>
          </div>
          {sucursales.length > 0 && (
            <select
              value={sucursalSeleccionada?.id ?? ''}
              onChange={handleChangeSucursal}
              className="px-3 py-2 rounded-lg border bg-white"
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
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <BackBar />

      {/* ESTADOS */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow p-8 text-center">
          <Loader2 className="animate-spin h-8 w-8 text-accent mx-auto mb-3" />
          <p>Cargando período…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">{error}</span>
          </div>
        </div>
      ) : !periodo ? (
        <div className="bg-white rounded-2xl shadow p-8 text-center">
          <p>No se encontró el período solicitado.</p>
        </div>
      ) : (
        <>
          {/* ── Resumen del período */}
          <div className="bg-white rounded-2xl shadow p-6 border">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">
                  {MESES[periodo.periodo_mes - 1]} {periodo.periodo_ano}
                </h2>
                <p className="text-gray-600">
                  {formatDateDDMMYYYY(periodo.fecha_inicio)} — {formatDateDDMMYYYY(periodo.fecha_fin)}
                </p>
                <div className="mt-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${ESTADOS_COLORS[periodo.estado]}`}
                  >
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
                    type="button"
                    onClick={handleSyncEmpleados}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border bg-white hover:bg-gray-50 shadow disabled:opacity-60"
                    title="Sincronizar empleados desde INVU"
                  >
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
                    {syncing ? 'Sincronizando…' : 'Sincronizar empleados'}
                  </button>
                )}
              </div>
            </div>
            {syncMessage && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
                  syncMessage.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {syncMessage.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <span>{syncMessage.message}</span>
              </div>
            )}
          </div>

          {/* ── Detalle de empleados */}
          <div className="bg-white rounded-2xl shadow p-6 border">
            <h3 className="text-xl font-semibold mb-4">Empleados del período</h3>

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
                      {detalle.map((row: any, i) => (
                        <tr
                          key={`${row.empleado_id ?? i}-${i}`}
                          className={i % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}
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
                          <td className="px-6 py-4 text-right text-slate-600">
                            {Number(row.horas ?? 0).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-semibold text-slate-900">
                            {money(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900 text-slate-50">
                        <td className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wide">
                          Totales
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold">{money(totals.salario)}</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold">
                          {totals.horas.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold">{money(totals.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* └─ Resumen final */}
          {resumen && (
            <div className="bg-white rounded-2xl shadow p-6 border">
              <h3 className="text-xl font-semibold mb-4">Resumen de totales</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-gray-500 text-sm">Empleados</div>
                  <div className="text-lg font-semibold">{resumen.total_empleados ?? '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Salarios</div>
                  <div className="text-lg font-semibold">{money(resumen.total_salarios)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Deducciones</div>
                  <div className="text-lg font-semibold">{money(resumen.total_deducciones)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Total Neto</div>
                  <div className="text-lg font-semibold">{money(resumen.total_neto)}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
