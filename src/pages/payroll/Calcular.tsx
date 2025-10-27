// src/pages/payroll/Calcular.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  RefreshCw,
  PlayCircle,
  AlertCircle,
  Loader2,
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
  const [detalle, setDetalle] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any>(null);

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
      const { data: detData, error: detErr } = await supabase
        .from('hr_periodo_detalle')
        .select('*')
        .eq('periodo_id', periodoId);
      if (detErr && detErr.code !== '42P01') throw detErr;

      setDetalle(detData || []);

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
              </div>
            </div>
          </div>

          {/* ── Detalle de empleados */}
          <div className="bg-white rounded-2xl shadow p-6 border">
            <h3 className="text-xl font-semibold mb-4">Empleados del período</h3>

            {detalle.length === 0 ? (
              <p className="text-gray-500">No hay registros de detalle para este período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left">Empleado</th>
                      <th className="px-4 py-2 text-right">Salario</th>
                      <th className="px-4 py-2 text-right">Horas</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((row: any, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-4 py-2">{row.empleado_nombre ?? row.empleado_id}</td>
                        <td className="px-4 py-2 text-right">
                          {Number(row.salario_base ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-right">{row.horas ?? '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold">
                          {Number(row.total ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  <div className="text-lg font-semibold">
                    ${Number(resumen.total_salarios ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Deducciones</div>
                  <div className="text-lg font-semibold">
                    ${Number(resumen.total_deducciones ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Total Neto</div>
                  <div className="text-lg font-semibold">
                    ${Number(resumen.total_neto ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
