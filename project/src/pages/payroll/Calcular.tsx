import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Play, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as AuthOrgMod from '../../context/AuthOrgContext';
import { supabase } from '../../lib/supabase';
import { formatDateDDMMYYYY } from '../../lib/format';

/* ────────────────────────────────────────────────────────────────────────────
   Contexto (resuelve default/named y provee fallback seguro)
--------------------------------------------------------------------------- */
type Sucursal = { id: string; nombre: string };

const useAuthOrg =
  (AuthOrgMod as any).useAuthOrg ??
  AuthOrgMod.default ??
  (() => ({
    sucursales: [] as Sucursal[],
    sucursalSeleccionada: null as Sucursal | null,
    setSucursalSeleccionada: (_: Sucursal | null) => {},
  }));

/* ────────────────────────────────────────────────────────────────────────────
   Tipos
--------------------------------------------------------------------------- */
type EstadoPeriodo = 'borrador' | 'calculado' | 'aprobado' | 'pagado';

type Periodo = {
  id: string;
  sucursal_id: string;
  periodo_mes: number; // 1..12
  periodo_ano: number; // YYYY
  fecha_inicio: string; // ISO date
  fecha_fin: string;    // ISO date
  estado: EstadoPeriodo;
  created_at: string;
};

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
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

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
--------------------------------------------------------------------------- */
function getQueryParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

/* ────────────────────────────────────────────────────────────────────────────
   Componente
--------------------------------------------------------------------------- */
export default function Calcular() {
  const navigate = useNavigate();
  const { sucursales, sucursalSeleccionada, setSucursalSeleccionada } = useAuthOrg();

  const periodoId = useMemo(() => getQueryParam('periodo'), []);
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState('');

  /* Cargar datos del período */
  const loadPeriodo = useCallback(async () => {
    try {
      if (!periodoId) {
        setError('Falta el parámetro ?periodo=');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('hr_periodo')
        .select('*')
        .eq('id', periodoId)
        .single();

      if (error) throw error;
      setPeriodo(data as Periodo);
    } catch (e: any) {
      console.error('[Calcular] loadPeriodo error', e);
      setError(e?.message ?? 'Error cargando el período');
      setPeriodo(null);
    } finally {
      setLoading(false);
    }
  }, [periodoId]);

  useEffect(() => void loadPeriodo(), [loadPeriodo]);

  /* Cambiar sucursal desde el header y volver a la lista */
  function handleChangeSucursal(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value;
    const nueva = sucursales.find((s) => String(s.id) === String(newId));
    if (nueva && typeof setSucursalSeleccionada === 'function') {
      setSucursalSeleccionada(nueva);
      localStorage.setItem('selectedSucursalId', nueva.id);
    }
    navigate('/payroll');
  }

  /* Acción Calcular (placeholder seguro) */
  const handleCalcular = useCallback(async () => {
    try {
      if (!periodo) return;
      setCalculando(true);
      setError('');

      // 🔒 Mantengo esto como placeholder seguro.
      // Si ya tienes una RPC, reemplaza por:
      // const { error } = await supabase.rpc('rpc_hr_calcular_periodo', { p_periodo_id: periodo.id });
      // if (error) throw error;

      // Simular un "recalcular": por ahora solo refrescamos el período.
      await new Promise((r) => setTimeout(r, 600));
      await loadPeriodo();
    } catch (e: any) {
      console.error('[Calcular] calcular error', e);
      setError(e?.message ?? 'Error al calcular');
    } finally {
      setCalculando(false);
    }
  }, [periodo, loadPeriodo]);

  /* UI */
  return (
    <div className="p-6 space-y-6">
      {/* Header: volver + selector sucursal */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/payroll')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-white hover:bg-gray-50 shadow"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver a períodos</span>
        </button>

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

      {/* Estado de carga / error */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700 mx-auto mb-3"></div>
          <p>Cargando período…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700">
            <RefreshCw className="h-4 w-4" />
            <span className="font-medium">{error}</span>
          </div>
        </div>
      ) : !periodo ? (
        <div className="bg-white rounded-2xl shadow p-8 text-center">
          <p>No se encontró el período solicitado.</p>
        </div>
      ) : (
        <>
          {/* Resumen del período */}
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
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${ESTADOS_COLORS[periodo.estado]}`}>
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
                  <Play className={`h-5 w-5 ${calculando ? 'animate-spin' : ''}`} />
                  {calculando ? 'Calculando…' : 'Calcular planilla'}
                </button>
              </div>
            </div>
          </div>

          {/* Contenido específico del cálculo */}
          <div className="bg-white rounded-2xl shadow p-6 border">
            {/* Aquí va tu tabla de empleados, conceptos, totales, etc. */}
            <p className="text-gray-600">
              Aquí aparecerá el detalle de la planilla (empleados, conceptos y totales) para el período seleccionado.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
