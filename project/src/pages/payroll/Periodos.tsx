// src/pages/payroll/Periodos.tsx
import { useEffect, useMemo, useState } from 'react';
import { Plus, Calendar, Eye, Trash2, AlertCircle } from 'lucide-react';
import { MonthYearPicker } from '../../lib/ui/MonthYearPicker';
import { supabase } from '../../lib/supabase';
import { formatDateDDMMYYYY } from '../../lib/format';
import * as AuthOrgMod from '../../context/AuthOrgContext';

/** ────────────────────────────────────────────────────────────────────────────
 * Resolver robusto del contexto (default o named)
 * ────────────────────────────────────────────────────────────────────────────
 */
const useAuthOrg =
  (AuthOrgMod as any).useAuthOrg ??
  (() => ({ sucursalSeleccionada: null }));

/** ────────────────────────────────────────────────────────────────────────────
 *  Tipos
 *  ────────────────────────────────────────────────────────────────────────────
 */
type EstadoPeriodo = 'borrador' | 'calculado' | 'aprobado' | 'pagado';

interface Periodo {
  id: string;
  sucursal_id: string;
  periodo_mes: number; // 1..12
  periodo_ano: number; // YYYY
  fecha_inicio: string; // ISO
  fecha_fin: string; // ISO
  estado: EstadoPeriodo;
  created_at: string;
}

interface Sucursal {
  id: string;
  nombre: string;
}

/** Etiquetas & estilos para “estado” */
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

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

/** ────────────────────────────────────────────────────────────────────────────
 *  Helpers
 *  ────────────────────────────────────────────────────────────────────────────
 */
function useQueryParam(name: string) {
  return useMemo(() => {
    if (typeof window === 'undefined') return null;
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  }, [name]);
}

/** ────────────────────────────────────────────────────────────────────────────
 *  Componente
 *  ────────────────────────────────────────────────────────────────────────────
 */
export default function Periodos() {
  /** ⚠️ El contexto debe exponer (idealmente) el setter.
   *  Si no lo expone, hacemos fallback a reload tras guardar en localStorage.
   */
  const authOrg = useAuthOrg() as {
    sucursalSeleccionada: Sucursal | null;
    setSucursalSeleccionada?: (s: Sucursal | null) => void;
  };

  const { sucursalSeleccionada, setSucursalSeleccionada } = authOrg;

  // Estado principal
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // UI Crear período
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    periodo: { mes: new Date().getMonth() + 1, año: new Date().getFullYear() },
    fecha_inicio: '',
    fecha_fin: '',
  });

  // Sucursales (para selector inline si no hay seleccionada)
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loadingSucursales, setLoadingSucursales] = useState(false);

  // Soportar ?branch=sf
  const qpBranch = useQueryParam('branch');

  /** ── Carga de períodos ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!sucursalSeleccionada) return;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('hr_periodo')
          .select('*')
          .eq('sucursal_id', sucursalSeleccionada.id)
          .order('periodo_ano', { ascending: false })
          .order('periodo_mes', { ascending: false });

        if (error) throw error;
        setPeriodos(data || []);
      } catch (err) {
        console.error('Error cargando períodos:', err);
        setError('Error cargando períodos');
      } finally {
        setLoading(false);
      }
    })();
  }, [sucursalSeleccionada]);

  /** ── Carga de sucursales (solo si no hay seleccionada) ──────────────────── */
  useEffect(() => {
    if (sucursalSeleccionada) return;
    let alive = true;
    (async () => {
      try {
        setLoadingSucursales(true);
        const { data, error } = await supabase
          .from('sucursal')
          .select('id, nombre')
          .order('nombre', { ascending: true });

        if (!alive) return;
        if (error) throw error;
        setSucursales(data || []);
      } catch (err) {
        console.error('Error cargando sucursales:', err);
        setSucursales([]);
      } finally {
        setLoadingSucursales(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sucursalSeleccionada]);

  /** ── Preselección: ?branch=, luego localStorage ─────────────────────────── */
  useEffect(() => {
    if (sucursalSeleccionada || sucursales.length === 0) return;

    // 1) Por querystring
    if (qpBranch) {
      const match = sucursales.find(
        s => s.id === qpBranch || s.nombre.toLowerCase().includes(qpBranch.toLowerCase())
      );
      if (match) {
        selectSucursal(match);
        return;
      }
    }

    // 2) Última guardada
    const saved = localStorage.getItem('selectedSucursalId');
    if (saved) {
      const found = sucursales.find(s => s.id === saved);
      if (found) selectSucursal(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qpBranch, sucursales, sucursalSeleccionada]);

  /** ── Seleccionar sucursal ───────────────────────────────────────────────── */
  function selectSucursal(s: Sucursal) {
    localStorage.setItem('selectedSucursalId', s.id);
    if (typeof setSucursalSeleccionada === 'function') {
      setSucursalSeleccionada(s);
    } else {
      // Fallback si el contexto aún no expone setter
      // (la app debe leer selectedSucursalId on mount)
      window.location.reload();
    }
  }

  /** ── Crear período ─────────────────────────────────────────────────────── */
  async function handleCreatePeriodo() {
    try {
      if (!sucursalSeleccionada) {
        setError('Selecciona una sucursal antes de crear el período');
        return;
      }
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        setError('Configuración de Supabase faltante. Verifica las variables de entorno.');
        return;
      }
      if (!formData.fecha_inicio || !formData.fecha_fin) {
        setError('Completa las fechas de inicio y fin.');
        return;
      }

      setSaving(true);
      setError('');

      const { error } = await supabase
        .from('hr_periodo')
        .insert({
          sucursal_id: sucursalSeleccionada.id,
          periodo_mes: formData.periodo.mes,
          periodo_ano: formData.periodo.año,
          fecha_inicio: formData.fecha_inicio,
          fecha_fin: formData.fecha_fin,
          estado: 'borrador' as EstadoPeriodo,
        });

      if (error) {
        if ((error as any).code === '23505') {
          throw new Error('Ya existe un período para este mes y año.');
        }
        if ((error as any).code === '42501') {
          throw new Error('No tienes permisos para crear períodos en esta sucursal.');
        }
        throw error;
      }

      // recargar lista
      const { data } = await supabase
        .from('hr_periodo')
        .select('*')
        .eq('sucursal_id', sucursalSeleccionada.id)
        .order('periodo_ano', { ascending: false })
        .order('periodo_mes', { ascending: false });

      setPeriodos(data || []);
      setShowForm(false);
      setFormData({
        periodo: { mes: new Date().getMonth() + 1, año: new Date().getFullYear() },
        fecha_inicio: '',
        fecha_fin: '',
      });
    } catch (err: any) {
      console.error('Error creando período:', err);
      if (err instanceof TypeError && String(err.message).includes('Failed to fetch')) {
        setError('Error de conexión con Supabase. Verifica tu configuración.');
      } else {
        setError(err?.message ?? 'Error creando período');
      }
    } finally {
      setSaving(false);
    }
  }

  /** ── Eliminar período ──────────────────────────────────────────────────── */
  async function handleDeletePeriodo(id: string) {
    const ok = confirm('¿Eliminar este período? Esta acción no se puede deshacer.');
    if (!ok) return;

    try {
      const { error } = await supabase.from('hr_periodo').delete().eq('id', id);
      if (error) throw error;
      setPeriodos(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Error eliminando período:', err);
      setError('Error eliminando período');
    }
  }

  /** ── Render: selector inline si NO hay sucursal ────────────────────────── */
  if (!sucursalSeleccionada) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <div className="bg-accent/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-12 w-12 text-accent" />
          </div>
          <h3 className="text-2xl font-bold text-bean mb-3">Selecciona una sucursal</h3>
          <p className="text-slate7g text-lg leading-relaxed mb-5">
            Necesitas seleccionar una sucursal para gestionar períodos de planilla.
          </p>

          <select
            className="px-4 py-3 rounded-2xl border border-sand bg-white"
            disabled={loadingSucursales || sucursales.length === 0}
            defaultValue=""
            onChange={(e) => {
              const s = sucursales.find(x => x.id === e.target.value);
              if (s) selectSucursal(s);
            }}
          >
            <option value="" disabled>
              {loadingSucursales ? 'Cargando sucursales…' : 'Elige una sucursal'}
            </option>
            {sucursales.map(s => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>

          {sucursales.length > 0 && (
            <div className="mt-4 flex gap-2 justify-center flex-wrap">
              {sucursales.slice(0, 3).map(s => (
                <button
                  key={s.id}
                  onClick={() => selectSucursal(s)}
                  className="px-3 py-2 text-sm rounded-xl border border-sand hover:bg-off transition"
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /** ── Render principal con períodos ─────────────────────────────────────── */
  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-4xl font-bold text-bean mb-4 tracking-tight">
            Períodos de Planilla
          </h1>
          <p className="text-xl text-slate7g leading-relaxed">
            Gestiona los períodos de cálculo de planilla para {sucursalSeleccionada.nombre}
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-3 px-6 py-3 bg-accent text-white font-semibold rounded-2xl hover:bg-opacity-90 transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-accent focus:ring-offset-2 shadow-lg"
        >
          <Plus className="h-5 w-5" />
          <span>Nuevo Período</span>
        </button>
      </div>

      {/* Error global */}
      {error && (
        <div className="mb-8 p-4 bg-red-50 border-l-4 border-red-400 rounded-xl">
          <div className="flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Modal: Crear período */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <h3 className="text-2xl font-bold text-bean mb-6">Crear Nuevo Período</h3>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-bean mb-2">
                  Período (Mes/Año)
                </label>
                <MonthYearPicker
                  value={formData.periodo}
                  onChange={(periodo) => setFormData(prev => ({ ...prev, periodo }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-bean mb-2">
                  Fecha de Inicio
                </label>
                <input
                  type="date"
                  value={formData.fecha_inicio}
                  onChange={(e) => setFormData(prev => ({ ...prev, fecha_inicio: e.target.value }))}
                  className="w-full px-4 py-3 border border-sand rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-bean mb-2">
                  Fecha de Fin
                </label>
                <input
                  type="date"
                  value={formData.fecha_fin}
                  onChange={(e) => setFormData(prev => ({ ...prev, fecha_fin: e.target.value }))}
                  className="w-full px-4 py-3 border border-sand rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
                  required
                />
              </div>
            </div>

            <div className="flex space-x-4 mt-8">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-3 border border-sand text-slate7g rounded-2xl hover:bg-off transition-all duration-200"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreatePeriodo}
                disabled={saving || !formData.fecha_inicio || !formData.fecha_fin}
                className="flex-1 px-4 py-3 bg-accent text-white rounded-2xl hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {saving ? 'Creando...' : 'Crear Período'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de períodos */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-slate7g">Cargando períodos...</p>
        </div>
      ) : periodos.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <Calendar className="h-16 w-16 text-slate7g mx-auto mb-6" />
          <h3 className="text-xl font-bold text-bean mb-3">No hay períodos creados</h3>
          <p className="text-slate7g mb-6">
            Crea tu primer período de planilla para comenzar.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-3 bg-accent text-white font-semibold rounded-2xl hover:bg-opacity-90 transition-all duration-200"
          >
            Crear Primer Período
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate7g text-white">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold">Período</th>
                  <th className="px-6 py-4 text-left font-semibold">Fechas</th>
                  <th className="px-6 py-4 text-left font-semibold">Estado</th>
                  <th className="px-6 py-4 text-left font-semibold">Creado</th>
                  <th className="px-6 py-4 text-center font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((periodo, index) => (
                  <tr
                    key={periodo.id}
                    className={`transition-colors duration-150 hover:bg-accent/5 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-off/30'
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-bean">
                        {MESES[periodo.periodo_mes - 1]} {periodo.periodo_ano}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate7g">
                      {formatDateDDMMYYYY(periodo.fecha_inicio)} — {formatDateDDMMYYYY(periodo.fecha_fin)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${ESTADOS_COLORS[periodo.estado]}`}>
                        {ESTADOS_LABELS[periodo.estado]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate7g">
                      {formatDateDDMMYYYY(periodo.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => (window.location.href = `/payroll/calcular?periodo=${periodo.id}`)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200"
                          title="Ver/Calcular"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {periodo.estado === 'borrador' && (
                          <button
                            onClick={() => handleDeletePeriodo(periodo.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
