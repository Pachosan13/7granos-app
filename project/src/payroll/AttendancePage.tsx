import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Filter, Loader2, RefreshCw, UploadCloud, Users, XCircle } from 'lucide-react';
import * as AuthOrgMod from '../context/AuthOrgContext';
import { supabase } from '../lib/supabase';
import { UploadZone } from '../components/UploadZone';
import { ToastContainer, ToastItem, createToast, dismissToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';

const useAuthOrg =
  (AuthOrgMod as any).useAuthOrg ??
  (() => ({ sucursalSeleccionada: null }));

type AttendanceRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: number | null;
};

type FiltersState = {
  year: string;
  month: string;
  search: string;
};

const DEFAULT_FILTERS: FiltersState = { year: '', month: '', search: '' };

export function AttendancePage() {
  const authOrg = useAuthOrg() as {
    sucursalSeleccionada: { id: string; nombre: string } | null;
  };

  const { sucursalSeleccionada } = authOrg;

  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FiltersState>(() => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS;
    try {
      const stored = window.localStorage.getItem('payroll_attendance_filters');
      if (!stored) return DEFAULT_FILTERS;
      return { ...DEFAULT_FILTERS, ...JSON.parse(stored) } as FiltersState;
    } catch {
      return DEFAULT_FILTERS;
    }
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const pushToast = (toast: Omit<ToastItem, 'id'>) => createToast(setToasts, toast);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('payroll_attendance_filters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    if (!sucursalSeleccionada) return;
    let alive = true;
    setLoading(true);
    setError('');
    supabase
      .from('v_ui_attendance')
      .select('*')
      .eq('sucursal_id', sucursalSeleccionada.id)
      .order('date', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (!alive) return;
        if (fetchError) throw fetchError;
        setAttendance((data as AttendanceRow[]) || []);
        if ((data ?? []).length === 0) {
          pushToast({
            title: 'Sin marcaciones registradas',
            tone: 'info',
            description: 'Carga un CSV para iniciar el historial o verifica que existan datos en Supabase.',
          });
        }
      })
      .catch((fetchError) => {
        if (!alive) return;
        console.error('Attendance fetch error', fetchError);
        setError('No pudimos obtener las marcaciones.');
        pushToast({
          title: 'Error cargando marcaciones',
          tone: 'error',
          description: 'Supabase no respondió. Intenta nuevamente o valida permisos de la vista v_ui_attendance.',
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [sucursalSeleccionada]);

  const filteredAttendance = useMemo(() => {
    return attendance.filter((row) => {
      if (filters.year && !row.date.startsWith(filters.year)) return false;
      if (filters.month) {
        const month = row.date.slice(5, 7);
        if (month !== filters.month.padStart(2, '0')) return false;
      }
      if (!filters.search) return true;
      return row.employee_name.toLowerCase().includes(filters.search.toLowerCase());
    });
  }, [attendance, filters]);

  const totalHoras = useMemo(() => {
    return filteredAttendance.reduce((acc, row) => acc + (row.total_hours ?? 0), 0);
  }, [filteredAttendance]);

  return (
    <div className="p-8">
      <ToastContainer toasts={toasts} onDismiss={(id) => dismissToast(setToasts, id)} />
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-bean">Marcaciones</h1>
            <p className="text-slate7g">
              Consulta y valida las asistencias reportadas por tus colaboradores.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!sucursalSeleccionada) return;
                setLoading(true);
                supabase
                  .from('v_ui_attendance')
                  .select('*')
                  .eq('sucursal_id', sucursalSeleccionada.id)
                  .order('date', { ascending: false })
                  .then(({ data, error: fetchError }) => {
                    if (fetchError) throw fetchError;
                    setAttendance((data as AttendanceRow[]) || []);
                    pushToast({ title: 'Marcaciones actualizadas', tone: 'success' });
                  })
                  .catch((refreshError) => {
                    console.error('Refresh attendance', refreshError);
                    pushToast({
                      title: 'No se pudo refrescar',
                      tone: 'error',
                      description: 'Verifica tu conexión o permisos en Supabase.',
                    });
                  })
                  .finally(() => setLoading(false));
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmClear(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
            >
              <XCircle className="h-4 w-4" />
              Limpiar filtros
            </button>
          </div>
        </header>

        <section className="mb-8 grid gap-4 rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter className="h-4 w-4" /> Filtros
          </div>
          <div className="grid gap-4 md:grid-cols-4">
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
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Mes
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                value={filters.month}
                onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="01"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 md:col-span-2">
              Buscar colaborador
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="Nombre o código"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              <CalendarClock className="h-4 w-4" /> Horas totales: {totalHoras.toFixed(2)} h
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
              <Users className="h-4 w-4" /> Registros: {filteredAttendance.length}
            </div>
          </div>
        </section>

        <section className="mb-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Importar CSV de marcaciones</h2>
          <p className="mb-4 text-sm text-slate-600">
            Puedes cargar un CSV para previsualizar y conciliar marcaciones antes de enviarlas al backend.
          </p>
          <UploadZone
            accept=".csv,text/csv"
            disabled={!sucursalSeleccionada}
            onFileSelected={(file) =>
              pushToast({
                title: 'CSV recibido',
                tone: 'info',
                description: `Procesa ${file.name} desde el módulo de planilla si necesitas consolidarlo.`,
              })
            }
            description="Archivos CSV de marcaciones (empleado, fecha, entrada, salida, horas)."
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Historial de marcaciones</h2>
            {loading && (
              <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
              </span>
            )}
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <div>
                {error}
                <button
                  type="button"
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    setError('');
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-700 underline"
                >
                  Limpiar filtros
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="mt-6 grid gap-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={`skeleton-${idx}`} className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="h-4 w-1/3 rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-full rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : filteredAttendance.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
              <UploadCloud className="mx-auto mb-4 h-10 w-10 text-slate-400" />
              <p className="text-sm text-slate-600">
                No hay marcaciones con los filtros actuales. Ajusta los criterios o sincroniza desde Supabase.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100">
              <table className="min-w-full text-sm">
                <thead className="bg-slate7g text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Colaborador</th>
                    <th className="px-4 py-3 text-left font-medium">Fecha</th>
                    <th className="px-4 py-3 text-left font-medium">Entrada</th>
                    <th className="px-4 py-3 text-left font-medium">Salida</th>
                    <th className="px-4 py-3 text-right font-medium">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.employee_name}</td>
                      <td className="px-4 py-3 text-slate-600">{row.date}</td>
                      <td className="px-4 py-3 text-slate-600">{row.check_in ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.check_out ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.total_hours?.toFixed(2) ?? '0.00'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={showConfirmClear}
        title="¿Limpiar filtros?"
        description="Se restaurarán los filtros de año, mes y búsqueda a sus valores iniciales."
        confirmLabel="Limpiar"
        tone="danger"
        onCancel={() => setShowConfirmClear(false)}
        onConfirm={() => {
          setFilters(DEFAULT_FILTERS);
          setShowConfirmClear(false);
        }}
      />
    </div>
  );
}
