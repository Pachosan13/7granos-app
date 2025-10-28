// src/pages/payroll/Periodos.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Calendar,
  Eye,
  Trash2,
  AlertCircle,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { MonthYearPicker } from '../../lib/ui/MonthYearPicker';
import { supabase } from '../../lib/supabase';
import { formatDateDDMMYYYY } from '../../lib/format';
import * as AuthOrgMod from '../../context/AuthOrgContext';
import { ToastContainer, ToastItem, createToast, dismissToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TableToolbar } from '../../components/TableToolbar';

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

type PeriodosFilters = {
  estado: EstadoPeriodo | 'todos';
  year: string;
  search: string;
  soloAbiertos: boolean;
};

const DEFAULT_FILTERS: PeriodosFilters = {
  estado: 'todos',
  year: '',
  search: '',
  soloAbiertos: false,
};

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

function readFilters(): PeriodosFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const raw = window.localStorage.getItem('payroll_periodos_filters');
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<PeriodosFilters>;
    return {
      estado: (parsed.estado as PeriodosFilters['estado']) ?? 'todos',
      year: parsed.year ?? '',
      search: parsed.search ?? '',
      soloAbiertos: parsed.soloAbiertos ?? false,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function getNextEstado(estado: EstadoPeriodo): EstadoPeriodo {
  if (estado === 'borrador') return 'calculado';
  if (estado === 'calculado') return 'aprobado';
  return estado === 'aprobado' ? 'pagado' : 'pagado';
}

/** ────────────────────────────────────────────────────────────────────────────
 *  Componente
 *  ────────────────────────────────────────────────────────────────────────────
 */
export default function Periodos() {
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // UI Crear período
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    periodo: { mes: new Date().getMonth() + 1, año: new Date().getFullYear() },
    fecha_inicio: '',
    fecha_fin: '',
  });

  const [deleteTarget, setDeleteTarget] = useState<Periodo | null>(null);
  const [closeTarget, setCloseTarget] = useState<Periodo | null>(null);
  const [closing, setClosing] = useState(false);
  const [manualTarget, setManualTarget] = useState<Periodo | null>(null);
  const [manualForm, setManualForm] = useState({ ajusteMonto: '', ajusteMotivo: '' });

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loadingSucursales, setLoadingSucursales] = useState(false);

  // Soportar ?branch=sf
  const qpBranch = useQueryParam('branch');
  const [filters, setFilters] = useState<PeriodosFilters>(readFilters);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('payroll_periodos_filters', JSON.stringify(filters));
  }, [filters]);

  const pushToast = (toast: Omit<ToastItem, 'id'>) => createToast(setToasts, toast);

  /** ── Carga de períodos ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!sucursalSeleccionada) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from('hr_periodo')
          .select('*')
          .eq('sucursal_id', sucursalSeleccionada.id)
          .order('periodo_ano', { ascending: false })
          .order('periodo_mes', { ascending: false });

        if (!alive) return;
        if (fetchError) throw fetchError;
        setPeriodos(data || []);
        setError('');
      } catch (err) {
        if (!alive) return;
        console.error('Error cargando períodos:', err);
        setError('No pudimos cargar los períodos. Revisa tu conexión.');
        pushToast({
          title: 'Error cargando períodos',
          tone: 'error',
          description: 'Supabase no respondió. Intenta nuevamente o contacta al equipo de datos.',
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sucursalSeleccionada]);

  /** ── Carga de sucursales (solo si no hay seleccionada) ──────────────────── */
  useEffect(() => {
    if (sucursalSeleccionada) return;
    let alive = true;
    (async () => {
      try {
        setLoadingSucursales(true);
        const { data, error: fetchError } = await supabase
          .from('sucursal')
          .select('id, nombre')
          .order('nombre', { ascending: true });

        if (!alive) return;
        if (fetchError) throw fetchError;
        setSucursales(data || []);
      } catch (err) {
        if (!alive) return;
        console.error('Error cargando sucursales:', err);
        setSucursales([]);
      } finally {
        if (alive) setLoadingSucursales(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sucursalSeleccionada]);

  /** ── Preselección: ?branch=, luego localStorage ─────────────────────────── */
  useEffect(() => {
    if (sucursalSeleccionada || sucursales.length === 0) return;

    if (qpBranch) {
      const match = sucursales.find(
        (s) => s.id === qpBranch || s.nombre.toLowerCase().includes(qpBranch.toLowerCase())
      );
      if (match) {
        selectSucursal(match);
        return;
      }
    }

    const saved = typeof window !== 'undefined' ? localStorage.getItem('selectedSucursalId') : null;
    if (saved) {
      const found = sucursales.find((s) => s.id === saved);
      if (found) selectSucursal(found);
    }
  }, [qpBranch, sucursales, sucursalSeleccionada]);

  /** ── Seleccionar sucursal ───────────────────────────────────────────────── */
  function selectSucursal(s: Sucursal) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedSucursalId', s.id);
    }
    if (typeof setSucursalSeleccionada === 'function') {
      setSucursalSeleccionada(s);
    } else {
      window.location.reload();
    }
  }

  /** ── Crear período ─────────────────────────────────────────────────────── */
  async function handleCreatePeriodo() {
    try {
      if (!sucursalSeleccionada) {
        setError('Selecciona una sucursal antes de crear el período');
        pushToast({
          title: 'Selecciona una sucursal',
          tone: 'warning',
          description: 'Elige la sucursal desde el selector superior antes de crear un período.',
        });
        return;
      }
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        setError('Configuración de Supabase faltante. Verifica las variables de entorno.');
        pushToast({
          title: 'Supabase no configurado',
          tone: 'error',
          description: 'Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para crear períodos reales.',
        });
        return;
      }
      if (!formData.fecha_inicio || !formData.fecha_fin) {
        setError('Completa las fechas de inicio y fin.');
        pushToast({
          title: 'Fechas incompletas',
          tone: 'warning',
          description: 'Indica fecha de inicio y fin para continuar.',
        });
        return;
      }

      const inicio = new Date(formData.fecha_inicio);
      const fin = new Date(formData.fecha_fin);
      if (Number.isNaN(inicio.valueOf()) || Number.isNaN(fin.valueOf()) || inicio > fin) {
        setError('Revisa el rango de fechas.');
        pushToast({
          title: 'Rango inválido',
          tone: 'warning',
          description: 'La fecha de inicio no puede ser posterior a la fecha de fin.',
        });
        return;
      }

      setSaving(true);
      setError('');

      const { error: insertError } = await supabase
        .from('hr_periodo')
        .insert({
          sucursal_id: sucursalSeleccionada.id,
          periodo_mes: formData.periodo.mes,
          periodo_ano: formData.periodo.año,
          fecha_inicio: formData.fecha_inicio,
          fecha_fin: formData.fecha_fin,
          estado: 'borrador' as EstadoPeriodo,
        });

      if (insertError) {
        if ((insertError as any).code === '23505') {
          throw new Error('Ya existe un período para este mes y año.');
        }
        if ((insertError as any).code === '42501') {
          throw new Error('No tienes permisos para crear períodos en esta sucursal.');
        }
        throw insertError;
      }

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

      pushToast({
        title: 'Período creado',
        tone: 'success',
        description: 'Ya puedes cargar asistencias o calcular la planilla desde la vista de detalle.',
      });
    } catch (err: any) {
      console.error('Error creando período:', err);
      const message =
        err instanceof TypeError && String(err.message).includes('Failed to fetch')
          ? 'Error de conexión con Supabase. Verifica tu configuración.'
          : err?.message ?? 'Error creando período';
      setError(message);
      pushToast({
        title: 'No se pudo crear el período',
        tone: 'error',
        description: message,
      });
    } finally {
      setSaving(false);
    }
  }

  /** ── Eliminar período ──────────────────────────────────────────────────── */
  async function handleDeletePeriodo(id: string) {
    try {
      const { error: deleteError } = await supabase.from('hr_periodo').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setPeriodos((prev) => prev.filter((p) => p.id !== id));
      pushToast({
        title: 'Período eliminado',
        tone: 'success',
        description: 'La lista se actualizó automáticamente.',
      });
    } catch (err) {
      console.error('Error eliminando período:', err);
      setError('Error eliminando período');
      pushToast({
        title: 'No se pudo eliminar',
        tone: 'error',
        description: 'Revisa tu conexión o permisos e intenta nuevamente.',
      });
    }
  }

  /** ── Cierre de período ────────────────────────────────────────────────── */
  async function handleClosePeriodo(periodo: Periodo) {
    try {
      setClosing(true);
      const nextEstado = getNextEstado(periodo.estado);
      const { error: updateError } = await supabase
        .from('hr_periodo')
        .update({ estado: nextEstado })
        .eq('id', periodo.id);

      if (updateError) throw updateError;

      setPeriodos((prev) => prev.map((p) => (p.id === periodo.id ? { ...p, estado: nextEstado } : p)));
      pushToast({
        title: 'Estado actualizado',
        tone: 'success',
        description: `El período pasó a «${ESTADOS_LABELS[nextEstado]}».`,
      });
      setCloseTarget(null);
    } catch (err) {
      console.error('Error cerrando período', err);
      pushToast({
        title: 'No se pudo actualizar el período',
        tone: 'error',
        description: 'Verifica permisos en Supabase o intenta más tarde.',
      });
    } finally {
      setClosing(false);
    }
  }

  /** ── Ajuste manual (UI temporal) ───────────────────────────────────────── */
  function handleManualSubmit() {
    if (!manualTarget) return;
    const monto = Number(manualForm.ajusteMonto);
    if (Number.isNaN(monto)) {
      pushToast({
        title: 'Monto inválido',
        tone: 'warning',
        description: 'Ingresa un número válido (puede ser negativo) para el ajuste.',
      });
      return;
    }
    if (!manualForm.ajusteMotivo.trim()) {
      pushToast({
        title: 'Motivo requerido',
        tone: 'warning',
        description: 'Describe el motivo del ajuste antes de guardarlo.',
      });
      return;
    }

    pushToast({
      title: 'Ajuste registrado localmente',
      tone: 'info',
      description:
        'El detalle se guardó en esta sesión. Documenta el requerimiento en el RFC para habilitar el endpoint definitivo.',
    });
    setManualTarget(null);
    setManualForm({ ajusteMonto: '', ajusteMotivo: '' });
  }

  const filteredPeriodos = useMemo(() => {
    return periodos.filter((periodo) => {
      if (filters.estado !== 'todos' && periodo.estado !== filters.estado) return false;
      if (filters.soloAbiertos && periodo.estado === 'pagado') return false;
      if (filters.year && String(periodo.periodo_ano) !== filters.year) return false;
      if (!filters.search) return true;
      const label = `${MESES[periodo.periodo_mes - 1]} ${periodo.periodo_ano}`.toLowerCase();
      return label.includes(filters.search.toLowerCase());
    });
  }, [periodos, filters]);

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
              const s = sucursales.find((x) => x.id === e.target.value);
              if (s) selectSucursal(s);
            }}
          >
            <option value="" disabled>
              {loadingSucursales ? 'Cargando sucursales…' : 'Elige una sucursal'}
            </option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>

          {sucursales.length > 0 && (
            <div className="mt-4 flex gap-2 justify-center flex-wrap">
              {sucursales.slice(0, 3).map((s) => (
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
      <ToastContainer toasts={toasts} onDismiss={(id) => dismissToast(setToasts, id)} />
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-4xl font-bold text-bean mb-4 tracking-tight">Períodos de Planilla</h1>
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
        <div className="mb-8 rounded-2xl border border-rose-200 bg-rose-50/90 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-1 h-5 w-5 text-rose-500" />
            <div>
              <p className="text-sm font-semibold text-rose-600">{error}</p>
              <p className="text-xs text-rose-500/80">
                Si el problema persiste, intenta recargar la página o contacta al equipo responsable del backend.
              </p>
            </div>
          </div>
        </div>
      )}

      <TableToolbar
        title="Períodos registrados"
        subtitle="Filtra por estado, año o busca un período específico. Las preferencias quedan guardadas en este navegador."
        onRefresh={() => {
          if (!sucursalSeleccionada) return;
          setLoading(true);
          supabase
            .from('hr_periodo')
            .select('*')
            .eq('sucursal_id', sucursalSeleccionada.id)
            .order('periodo_ano', { ascending: false })
            .order('periodo_mes', { ascending: false })
            .then(({ data, error: fetchError }) => {
              if (fetchError) throw fetchError;
              setPeriodos(data || []);
            })
            .catch((refreshError) => {
              console.error('Refresh error', refreshError);
              pushToast({
                title: 'No se pudo actualizar',
                tone: 'error',
                description: 'Revisa tu conexión y vuelve a intentarlo.',
              });
            })
            .finally(() => setLoading(false));
        }}
        filters={
          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Estado
              <select
                value={filters.estado}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, estado: e.target.value as PeriodosFilters['estado'] }))
                }
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="todos">Todos</option>
                <option value="borrador">Borrador</option>
                <option value="calculado">Calculado</option>
                <option value="aprobado">Aprobado</option>
                <option value="pagado">Pagado</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Año
              <input
                type="number"
                inputMode="numeric"
                min={2000}
                max={2100}
                value={filters.year}
                onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value }))}
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="2024"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 md:col-span-2">
              Buscar
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Ej. Enero 2024"
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 md:col-span-4">
              <input
                type="checkbox"
                checked={filters.soloAbiertos}
                onChange={(e) => setFilters((prev) => ({ ...prev, soloAbiertos: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent/60"
              />
              Ver solo períodos abiertos (sin pago registrado)
            </label>
          </div>
        }
      />

      {/* Modal: Crear período */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-bean mb-1">Crear nuevo período</h3>
                <p className="text-sm text-slate-500">
                  Define las fechas que utilizarás para el cálculo de planilla.
                </p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 mt-6">
              <div>
                <label className="block text-sm font-medium text-bean mb-2">Período (Mes/Año)</label>
                <MonthYearPicker
                  value={formData.periodo}
                  onChange={(periodo) => setFormData((prev) => ({ ...prev, periodo }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-bean mb-2">Fecha de inicio</label>
                <input
                  type="date"
                  value={formData.fecha_inicio}
                  onChange={(e) => setFormData((prev) => ({ ...prev, fecha_inicio: e.target.value }))}
                  className="w-full px-4 py-3 border border-sand rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-bean mb-2">Fecha de fin</label>
                <input
                  type="date"
                  value={formData.fecha_fin}
                  onChange={(e) => setFormData((prev) => ({ ...prev, fecha_fin: e.target.value }))}
                  className="w-full px-4 py-3 border border-sand rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-8 sm:flex-row">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-3 border border-sand text-slate7g rounded-2xl hover:bg-off transition"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreatePeriodo}
                disabled={saving || !formData.fecha_inicio || !formData.fecha_fin}
                className="flex-1 px-4 py-3 bg-accent text-white rounded-2xl hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {saving ? 'Creando…' : 'Crear período'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de períodos */}
      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="animate-pulse rounded-3xl border border-slate-100 bg-white/60 p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="h-4 w-24 rounded bg-slate-200" />
              </div>
              <div className="mt-4 h-3 w-full rounded bg-slate-100" />
              <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : filteredPeriodos.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <Calendar className="h-16 w-16 text-slate7g mx-auto mb-6" />
          <h3 className="text-xl font-bold text-bean mb-3">Sin resultados</h3>
          <p className="text-slate7g mb-6">
            Ajusta los filtros o limpia la búsqueda para ver otros períodos.
          </p>
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="px-6 py-3 bg-accent text-white font-semibold rounded-2xl hover:bg-opacity-90 transition"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mt-6">
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
                {filteredPeriodos.map((periodo, index) => (
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
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition"
                          title="Ver/Calcular"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setManualTarget(periodo)}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition"
                          title="Registrar ajuste manual"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        {periodo.estado !== 'pagado' && (
                          <button
                            onClick={() => setCloseTarget(periodo)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition"
                            title="Confirmar avance de estado"
                          >
                            <ShieldCheck className="h-4 w-4" />
                          </button>
                        )}
                        {periodo.estado === 'borrador' && (
                          <button
                            onClick={() => setDeleteTarget(periodo)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition"
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="¿Eliminar período?"
        description={
          deleteTarget && (
            <p>
              Esta acción eliminará el período <strong>{MESES[deleteTarget.periodo_mes - 1]} {deleteTarget.periodo_ano}</strong>.
              Se recomienda conservar un respaldo antes de continuar.
            </p>
          )
        }
        tone="danger"
        confirmLabel="Eliminar"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          handleDeletePeriodo(deleteTarget.id).finally(() => setDeleteTarget(null));
        }}
      />

      <ConfirmDialog
        open={Boolean(closeTarget)}
        title="Confirmar avance de estado"
        description={
          closeTarget && (
            <div className="space-y-3 text-sm">
              <p>
                El período actualmente está en estado <strong>{ESTADOS_LABELS[closeTarget.estado]}</strong>.
              </p>
              <p>
                Al confirmar, se moverá al siguiente estado permitido. Este cambio queda registrado en Supabase.
              </p>
            </div>
          )
        }
        confirmLabel="Confirmar"
        onCancel={() => {
          setCloseTarget(null);
          setClosing(false);
        }}
        loading={closing}
        onConfirm={() => closeTarget && handleClosePeriodo(closeTarget)}
      />

      {manualTarget && (
        <div className="fixed inset-0 z-[1150] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-slate-900">Ajuste manual</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Registra un ajuste temporal mientras se habilita el endpoint oficial.
                </p>
              </div>
              <button
                onClick={() => {
                  setManualTarget(null);
                  setManualForm({ ajusteMonto: '', ajusteMotivo: '' });
                }}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Monto del ajuste (S/)
                <input
                  type="number"
                  value={manualForm.ajusteMonto}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, ajusteMonto: e.target.value }))}
                  min={-1000000}
                  max={1000000}
                  step="0.01"
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="0.00"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 md:col-span-2">
                Motivo
                <textarea
                  value={manualForm.ajusteMotivo}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, ajusteMotivo: e.target.value }))}
                  rows={4}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="Describe qué se ajusta y por qué"
                />
              </label>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setManualTarget(null);
                  setManualForm({ ajusteMonto: '', ajusteMotivo: '' });
                }}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleManualSubmit}
                className="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-300"
              >
                Guardar registro
              </button>
            </div>

            <p className="mt-6 rounded-2xl bg-amber-50 p-4 text-xs text-amber-700">
              ⚠️ Este ajuste solo se guarda en esta sesión. Documenta el detalle en un RFC para implementar el endpoint oficial.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
