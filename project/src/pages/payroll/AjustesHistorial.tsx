import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Download,
  Loader2,
  RefreshCw,
  StickyNote,
  Tag,
  UserSearch,
} from 'lucide-react';
import * as AuthOrgMod from '../../context/AuthOrgContext';
import { supabase, shouldUseDemoMode } from '../../lib/supabase';
import { TableToolbar } from '../../components/TableToolbar';

/**
 * Resolver robusto del contexto (default o named)
 */
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

/**
 * Tipos
 */
type AjusteTipo = 'adelanto' | 'descuento' | 'bono';

type RawAjuste = {
  id: string;
  periodo: string;
  empleado_id: string;
  sucursal_id: string;
  tipo: AjusteTipo;
  monto: number;
  nota: string | null;
  created_at: string;
  empleados: { nombre: string | null } | null;
  sucursales: { nombre: string | null } | null;
};

type Ajuste = {
  id: string;
  periodo: string;
  empleadoId: string;
  empleadoNombre: string;
  sucursalId: string;
  sucursalNombre: string;
  tipo: AjusteTipo;
  monto: number;
  nota: string;
  createdAt: string;
};

type AjustesFilters = {
  sucursalId: string;
  search: string;
  periodo: string;
  tipo: '' | AjusteTipo;
};

const DEFAULT_FILTERS: AjustesFilters = {
  sucursalId: '',
  search: '',
  periodo: '',
  tipo: '',
};

const FILTERS_STORAGE_KEY = 'payroll_ajustes_historial_filters_v1';

/**
 * Helpers
 */
const formatCurrency = (value: number | null | undefined) => {
  const numeric = Number(value ?? 0);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  return new Intl.NumberFormat('es-PA', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-PA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toCsvValue = (value: string | number) => {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const buildDemoRows = (sucursales: Sucursal[], sucursalId: string): Ajuste[] => {
  const targetSucursal =
    sucursales.find((s) => String(s.id) === String(sucursalId)) ?? sucursales[0];

  const sucursalNombre = targetSucursal?.nombre ?? 'Sucursal demo';

  const now = new Date();
  const month = now.getMonth() + 1;
  const padMonth = month < 10 ? `0${month}` : String(month);
  const periodoActual = `${now.getFullYear()}-${padMonth}`;

  return [
    {
      id: 'demo-ajuste-1',
      periodo: periodoActual,
      empleadoId: 'emp-1',
      empleadoNombre: 'Juan Pérez',
      sucursalId: targetSucursal?.id ?? 'demo',
      sucursalNombre,
      tipo: 'bono',
      monto: 150,
      nota: 'Bono por desempeño',
      createdAt: now.toISOString(),
    },
    {
      id: 'demo-ajuste-2',
      periodo: periodoActual,
      empleadoId: 'emp-2',
      empleadoNombre: 'María Gómez',
      sucursalId: targetSucursal?.id ?? 'demo',
      sucursalNombre,
      tipo: 'descuento',
      monto: -75,
      nota: 'Descuento por adelanto',
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString(),
    },
    {
      id: 'demo-ajuste-3',
      periodo: periodoActual,
      empleadoId: 'emp-3',
      empleadoNombre: 'Carlos Rodríguez',
      sucursalId: targetSucursal?.id ?? 'demo',
      sucursalNombre,
      tipo: 'adelanto',
      monto: -120,
      nota: 'Adelanto de quincena',
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 48).toISOString(),
    },
  ];
};

function readFilters(): AjustesFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<AjustesFilters>;
    return {
      sucursalId: parsed.sucursalId ?? '',
      search: parsed.search ?? '',
      periodo: parsed.periodo ?? '',
      tipo: (parsed.tipo as AjustesFilters['tipo']) ?? '',
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

/**
 * Componente principal
 */
export default function AjustesHistorial() {
  const { sucursales, sucursalSeleccionada, setSucursalSeleccionada } = useAuthOrg();

  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [filters, setFilters] = useState<AjustesFilters>(readFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handlePersistFilters = useCallback((next: AjustesFilters) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    if (filters.sucursalId || !sucursalSeleccionada) return;
    setFilters((prev) => {
      const next = { ...prev, sucursalId: sucursalSeleccionada.id };
      handlePersistFilters(next);
      return next;
    });
  }, [filters.sucursalId, handlePersistFilters, sucursalSeleccionada]);

  const fetchAjustes = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      if (shouldUseDemoMode) {
        const demoRows = buildDemoRows(sucursales, filters.sucursalId);
        setAjustes(demoRows);
        return;
      }

      let query = supabase
        .from('payroll_ajustes')
        .select(
          `id, periodo, empleado_id, sucursal_id, tipo, monto, nota, created_at, empleados ( nombre ), sucursales ( nombre )`
        )
        .order('created_at', { ascending: false });

      if (filters.sucursalId) {
        query = query.eq('sucursal_id', filters.sucursalId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const normalized = (data ?? []).map((row) => ({
        id: (row as RawAjuste).id,
        periodo: (row as RawAjuste).periodo,
        empleadoId: (row as RawAjuste).empleado_id,
        empleadoNombre: (row as RawAjuste).empleados?.nombre ?? '—',
        sucursalId: (row as RawAjuste).sucursal_id,
        sucursalNombre: (row as RawAjuste).sucursales?.nombre ?? '—',
        tipo: (row as RawAjuste).tipo,
        monto: Number((row as RawAjuste).monto ?? 0),
        nota: (row as RawAjuste).nota ?? '',
        createdAt: (row as RawAjuste).created_at,
      }));

      setAjustes(normalized);
    } catch (err) {
      console.error('Error cargando ajustes', err);
      setAjustes([]);
      setError('No pudimos cargar el historial de ajustes. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }, [filters.sucursalId, sucursales]);

  useEffect(() => {
    void fetchAjustes();
  }, [fetchAjustes]);

  const handleFilterChange = useCallback(
    <K extends keyof AjustesFilters>(key: K, value: AjustesFilters[K]) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        handlePersistFilters(next);
        return next;
      });
      setPage(1);
    },
    [handlePersistFilters]
  );

  const handleSucursalChange: React.ChangeEventHandler<HTMLSelectElement> = useCallback(
    (event) => {
      const nextId = event.target.value;
      const nextSucursal =
        sucursales.find((s) => String(s.id) === String(nextId)) ?? null;
      handleFilterChange('sucursalId', nextId);
      if (nextSucursal) {
        setSucursalSeleccionada(nextSucursal);
      }
    },
    [handleFilterChange, setSucursalSeleccionada, sucursales]
  );

  const filteredRows = useMemo(() => {
    return ajustes.filter((ajuste) => {
      if (filters.sucursalId && ajuste.sucursalId !== filters.sucursalId) return false;
      if (filters.periodo && ajuste.periodo !== filters.periodo) return false;
      if (filters.tipo && ajuste.tipo !== filters.tipo) return false;

      if (filters.search) {
        const haystack = `${ajuste.empleadoNombre} ${ajuste.sucursalNombre} ${ajuste.nota}`.toLowerCase();
        if (!haystack.includes(filters.search.toLowerCase())) return false;
      }

      return true;
    });
  }, [ajustes, filters]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        if (row.tipo === 'bono') acc.bonos += row.monto;
        if (row.tipo === 'adelanto' || row.tipo === 'descuento') acc.descuentos += row.monto;
        acc.neto += row.monto;
        return acc;
      },
      { bonos: 0, descuentos: 0, neto: 0 }
    );
  }, [filteredRows]);

  const totalPages = useMemo(() => {
    if (!filteredRows.length) return 1;
    return Math.max(1, Math.ceil(filteredRows.length / pageSize));
  }, [filteredRows.length, pageSize]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const handleExportCsv = useCallback(() => {
    if (!filteredRows.length || typeof window === 'undefined') return;

    const header = ['Empleado', 'Sucursal', 'Periodo', 'Tipo', 'Monto', 'Nota', 'Creado'];

    const csvRows = filteredRows.map((row) =>
      [
        toCsvValue(row.empleadoNombre || '—'),
        toCsvValue(row.sucursalNombre || '—'),
        toCsvValue(row.periodo),
        toCsvValue(row.tipo),
        toCsvValue(row.monto),
        toCsvValue(row.nota || ''),
        toCsvValue(formatDateTime(row.createdAt)),
      ].join(',')
    );

    const csvContent = [header.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    const safeSucursal = filters.sucursalId ? `-${filters.sucursalId}` : '';
    link.href = url;
    link.download = `ajustes-payroll${safeSucursal || ''}.csv`;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, [filteredRows, filters.sucursalId]);

  const handleRefresh = useCallback(() => {
    void fetchAjustes();
  }, [fetchAjustes]);

  const showEmptyState = !loading && !error && filteredRows.length === 0;

  return (
    <div className="space-y-6 p-6">
      <TableToolbar
        title="Historial de ajustes"
        subtitle="Adelantos, descuentos y bonos registrados."
        onRefresh={handleRefresh}
        actions={
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!filteredRows.length}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        }
        filters={
          <div className="grid gap-3 md:grid-cols-5">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                <Building2 className="h-3.5 w-3.5" /> Sucursal
              </span>
              <select
                value={filters.sucursalId}
                onChange={handleSucursalChange}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="">Todas las sucursales</option>
                {sucursales.map((sucursal) => (
                  <option key={sucursal.id} value={sucursal.id}>
                    {sucursal.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                <UserSearch className="h-3.5 w-3.5" /> Empleado
              </span>
              <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/30">
                <input
                  type="search"
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  placeholder="Buscar por empleado, sucursal o nota"
                  className="w-full bg-transparent py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                <Tag className="h-3.5 w-3.5" /> Tipo
              </span>
              <select
                value={filters.tipo}
                onChange={(e) => handleFilterChange('tipo', e.target.value as AjustesFilters['tipo'])}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="">Todos</option>
                <option value="adelanto">Adelanto</option>
                <option value="descuento">Descuento</option>
                <option value="bono">Bono</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                <CalendarIcon /> Periodo
              </span>
              <input
                type="month"
                value={filters.periodo}
                onChange={(e) => handleFilterChange('periodo', e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="YYYY-MM"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                <StickyNote className="h-3.5 w-3.5" /> Resultados
              </span>
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setPageSize(next);
                    setPage(1);
                  }}
                  className="bg-transparent focus:outline-none"
                >
                  <option value={10}>10 por página</option>
                  <option value={20}>20 por página</option>
                  <option value={50}>50 por página</option>
                </select>
                <span className="text-xs text-slate-500">{filteredRows.length} registros</span>
              </div>
            </label>
          </div>
        }
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
          <p className="text-sm text-slate-600">Cargando historial…</p>
        </div>
      ) : error ? (
        <div className="flex items-start gap-3 rounded-3xl border-l-4 border-rose-500 bg-rose-50 p-6 text-rose-700 shadow-sm">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-semibold">{error}</p>
            <p className="text-sm text-rose-600">Refresca la página o ajusta los filtros.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Ajustes aplicados</h3>
              <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1 text-xs text-slate-600">
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Actualizado</span>
              </div>
            </div>

            {showEmptyState ? (
              <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-slate-600">
                <div className="rounded-full bg-slate-100 p-3 text-slate-500">
                  <Loader2 className="h-6 w-6" />
                </div>
                <p className="font-medium">No encontramos ajustes con los filtros aplicados.</p>
                <p className="text-sm text-slate-500">Prueba quitando filtros o cambiando de sucursal.</p>
              </div>
            ) : (
              <div className="overflow-hidden">
                <div className="max-h-[520px] overflow-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Empleado</th>
                        <th className="px-4 py-3 font-semibold">Sucursal</th>
                        <th className="px-4 py-3 font-semibold">Periodo</th>
                        <th className="px-4 py-3 font-semibold text-center">Tipo</th>
                        <th className="px-4 py-3 font-semibold text-right">Monto</th>
                        <th className="px-4 py-3 font-semibold">Nota</th>
                        <th className="px-4 py-3 font-semibold text-right">Creado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-800">
                      {paginatedRows.map((row) => {
                        const isPositive = row.tipo === 'bono';
                        const isNegative = row.tipo === 'descuento' || row.tipo === 'adelanto';
                        return (
                          <tr key={row.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3 align-middle text-[13px] font-semibold text-slate-900">
                              {row.empleadoNombre || '—'}
                            </td>
                            <td className="px-4 py-3 align-middle text-xs text-slate-600">{row.sucursalNombre || '—'}</td>
                            <td className="px-4 py-3 align-middle text-xs text-slate-600">{row.periodo}</td>
                            <td className="px-4 py-3 align-middle text-center">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  isPositive
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : isNegative
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {isPositive ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {row.tipo}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-middle text-right font-semibold text-slate-900">
                              {formatCurrency(row.monto)}
                            </td>
                            <td className="max-w-[220px] px-4 py-3 align-middle text-xs text-slate-600">
                              <span className="line-clamp-2" title={row.nota}>
                                {row.nota || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-middle text-right text-xs text-slate-500">
                              {formatDateTime(row.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredRows.length > pageSize && (
                  <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-slate-600">
                      Mostrando {paginatedRows.length} de {filteredRows.length} ajustes
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <span className="text-xs text-slate-500">
                        Página {page} de {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-900">Resumen</h4>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-emerald-600">Bonos (positivo)</p>
                <p className="text-2xl font-semibold text-emerald-700">{formatCurrency(totals.bonos)}</p>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-rose-600">Adelantos / descuentos (negativo)</p>
                <p className="text-2xl font-semibold text-rose-700">{formatCurrency(totals.descuentos)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-600">Impacto neto</p>
                <p className="text-2xl font-semibold text-slate-900">{formatCurrency(totals.neto)}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              El signo ya viene aplicado: bonos suman, adelantos y descuentos restan.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
