import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Filter, Loader2, Plus, RefreshCw, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ToastContainer, ToastItem, createToast, dismissToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import * as AuthOrgMod from '../../context/AuthOrgContext';

const useAuthOrg =
  (AuthOrgMod as any).useAuthOrg ??
  (() => ({ sucursalSeleccionada: null }));

type FixedExpense = {
  id: string;
  sucursal_id: string;
  categoria: string;
  descripcion: string;
  monto: number;
  periodo: string;
  estado: 'pendiente' | 'pagado';
};

type Filters = {
  periodo: string;
  estado: 'todos' | 'pendiente' | 'pagado';
  search: string;
};

const DEFAULT_FILTERS: Filters = { periodo: '', estado: 'todos', search: '' };

export default function GastosFijosLista() {
  const authOrg = useAuthOrg() as {
    sucursalSeleccionada: { id: string; nombre: string } | null;
  };

  const { sucursalSeleccionada } = authOrg;
  const [items, setItems] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(() => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS;
    try {
      const stored = window.localStorage.getItem('fixed_expenses_filters');
      if (!stored) return DEFAULT_FILTERS;
      return { ...DEFAULT_FILTERS, ...JSON.parse(stored) } as Filters;
    } catch {
      return DEFAULT_FILTERS;
    }
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const pushToast = (toast: Omit<ToastItem, 'id'>) => createToast(setToasts, toast);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('fixed_expenses_filters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    if (!sucursalSeleccionada) return;
    setLoading(true);
    supabase
      .from('v_ui_fixed_expenses')
      .select('*')
      .eq('sucursal_id', sucursalSeleccionada.id)
      .order('periodo', { ascending: false })
      .then(({ data, error }) => {
        if (error) throw error;
        setItems((data as FixedExpense[]) || []);
      })
      .catch((err) => {
        console.error('Gastos fijos fetch', err);
        pushToast({
          title: 'Error cargando gastos fijos',
          tone: 'error',
          description: 'No pudimos obtener los gastos fijos. Revisa permisos de la vista v_ui_fixed_expenses.',
        });
      })
      .finally(() => setLoading(false));
  }, [sucursalSeleccionada]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filters.periodo && item.periodo !== filters.periodo) return false;
      if (filters.estado !== 'todos' && item.estado !== filters.estado) return false;
      if (!filters.search) return true;
      return `${item.categoria} ${item.descripcion}`.toLowerCase().includes(filters.search.toLowerCase());
    });
  }, [items, filters]);

  const total = useMemo(() => filteredItems.reduce((acc, item) => acc + Number(item.monto || 0), 0), [filteredItems]);

  return (
    <div className="p-8">
      <ToastContainer toasts={toasts} onDismiss={(id) => dismissToast(setToasts, id)} />
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-bean">Gastos fijos</h1>
            <p className="text-slate7g">Controla tus contratos recurrentes y pagos periódicos.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl border border-accent/40 bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent/90"
            >
              <Plus className="h-4 w-4" /> Nuevo gasto fijo
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <XCircle className="h-4 w-4" /> Limpiar filtros
            </button>
            <button
              type="button"
              onClick={() => {
                if (!sucursalSeleccionada) return;
                setLoading(true);
                supabase
                  .from('v_ui_fixed_expenses')
                  .select('*')
                  .eq('sucursal_id', sucursalSeleccionada.id)
                  .order('periodo', { ascending: false })
                  .then(({ data, error }) => {
                    if (error) throw error;
                    setItems((data as FixedExpense[]) || []);
                    pushToast({ title: 'Gastos actualizados', tone: 'success' });
                  })
                  .catch((refreshErr) => {
                    console.error('Refresh fixed expenses', refreshErr);
                    pushToast({
                      title: 'No se pudo refrescar',
                      tone: 'error',
                      description: 'Verifica tu conexión con Supabase.',
                    });
                  })
                  .finally(() => setLoading(false));
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" /> Refrescar
            </button>
          </div>
        </header>

        <section className="mb-8 grid gap-4 rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter className="h-4 w-4" /> Filtros
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Periodo (YYYY-MM)
              <input
                value={filters.periodo}
                onChange={(e) => setFilters((prev) => ({ ...prev, periodo: e.target.value }))}
                placeholder="2024-01"
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Estado
              <select
                value={filters.estado}
                onChange={(e) => setFilters((prev) => ({ ...prev, estado: e.target.value as Filters['estado'] }))}
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="todos">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="pagado">Pagado</option>
              </select>
            </label>
            <label className="md:col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-600">
              Buscar
              <input
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Proveedor, categoría, descripción"
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </label>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            <DollarSign className="h-4 w-4" /> Total filtrado: S/ {total.toFixed(2)}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Listado</h2>
            {loading && (
              <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
              </span>
            )}
          </div>

          {loading ? (
            <div className="mt-6 grid gap-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={`skeleton-${idx}`} className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="h-4 w-1/2 rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-2/3 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
              <p className="text-sm text-slate-600">
                No hay gastos fijos registrados con los filtros actuales. Puedes crear uno nuevo o ajustar los filtros.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100">
              <table className="min-w-full text-sm">
                <thead className="bg-slate7g text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Categoría</th>
                    <th className="px-4 py-3 text-left font-medium">Descripción</th>
                    <th className="px-4 py-3 text-left font-medium">Periodo</th>
                    <th className="px-4 py-3 text-right font-medium">Monto</th>
                    <th className="px-4 py-3 text-left font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{item.categoria}</td>
                      <td className="px-4 py-3 text-slate-600">{item.descripcion}</td>
                      <td className="px-4 py-3 text-slate-600">{item.periodo}</td>
                      <td className="px-4 py-3 text-right text-slate-700">S/ {Number(item.monto || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                            item.estado === 'pagado'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.estado === 'pagado' ? 'Pagado' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="¿Restablecer filtros?"
        description="Se limpiarán el periodo, estado y texto de búsqueda."
        confirmLabel="Restablecer"
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={() => {
          setFilters(DEFAULT_FILTERS);
          setShowClearConfirm(false);
        }}
      />
    </div>
  );
}
