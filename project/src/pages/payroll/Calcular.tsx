import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Download,
  Loader2,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import * as AuthOrgMod from '../../context/AuthOrgContext';
import { supabase, shouldUseDemoMode } from '../../lib/supabase';

type Row = {
  empleado_id: string;
  empleado: string;
  sucursal_id: string;
  sucursal: string;
  salario_base: number;
  salario_quincenal: number;
  seguro_social: number;
  seguro_educativo: number;
  total_deducciones: number;
  salario_neto_quincenal: number;
};

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

const MOCK_ROWS: Row[] = [
  {
    empleado_id: 'demo-01',
    empleado: 'Juan Pérez',
    sucursal_id: 'demo',
    sucursal: 'Sucursal demo',
    salario_base: 1200,
    salario_quincenal: 600,
    seguro_social: 58.5,
    seguro_educativo: 7.5,
    total_deducciones: 66,
    salario_neto_quincenal: 534,
  },
  {
    empleado_id: 'demo-02',
    empleado: 'María Gómez',
    sucursal_id: 'demo',
    sucursal: 'Sucursal demo',
    salario_base: 950,
    salario_quincenal: 475,
    seguro_social: 46.31,
    seguro_educativo: 5.94,
    total_deducciones: 52.25,
    salario_neto_quincenal: 422.75,
  },
  {
    empleado_id: 'demo-03',
    empleado: 'Carlos Rodríguez',
    sucursal_id: 'demo',
    sucursal: 'Sucursal demo',
    salario_base: 1500,
    salario_quincenal: 750,
    seguro_social: 73.13,
    seguro_educativo: 9.38,
    total_deducciones: 82.51,
    salario_neto_quincenal: 667.49,
  },
];

const formatCurrency = (value: number | null | undefined) => {
  const numeric = Number(value ?? 0);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  return new Intl.NumberFormat('es-PA', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
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

const buildMockRows = (sucursalId: string, sucursalNombre: string) =>
  MOCK_ROWS.map((row, index) => ({
    ...row,
    empleado_id: `${row.empleado_id}-${index + 1}`,
    sucursal_id: sucursalId,
    sucursal: sucursalNombre || row.sucursal,
  }));

export default function Calcular() {
  const { sucursales, sucursalSeleccionada, setSucursalSeleccionada } = useAuthOrg();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [demoReason, setDemoReason] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedSucursal = sucursalSeleccionada ?? null;
  const currentSucursalId = selectedSucursal?.id ?? null;
  const currentSucursalName = selectedSucursal?.nombre ?? '';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sucursalSeleccionada && sucursales.length > 0) {
      const storedId = window.localStorage.getItem('selectedSucursalId');
      const fallback = storedId
        ? sucursales.find((s) => String(s.id) === String(storedId))
        : sucursales[0];
      if (fallback) {
        setSucursalSeleccionada(fallback);
      }
    }
  }, [sucursalSeleccionada, sucursales, setSucursalSeleccionada]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.empleados += 1;
        acc.bruto += Number(row.salario_quincenal ?? 0);
        acc.deducciones += Number(row.total_deducciones ?? 0);
        acc.neto += Number(row.salario_neto_quincenal ?? 0);
        return acc;
      },
      { empleados: 0, bruto: 0, deducciones: 0, neto: 0 }
    );
  }, [rows]);

  const clearIntervalRef = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchRows = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!currentSucursalId) {
        clearIntervalRef();
        setRows([]);
        setError('');
        setIsDemo(false);
        setDemoReason(null);
        setLastUpdated(null);
        setLoading(false);
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }
      setError('');
      setIsDemo(false);
      setDemoReason(null);

      try {
        if (shouldUseDemoMode) {
          const mock = buildMockRows(currentSucursalId, currentSucursalName);
          setRows(mock);
          setIsDemo(true);
          setDemoReason('Modo demo habilitado.');
          return;
        }

        const { data, error: queryError } = await supabase
          .from('payroll_detalle_quincena')
          .select('*')
          .eq('sucursal_id', currentSucursalId)
          .order('empleado', { ascending: true });

        if (queryError) {
          throw queryError;
        }

        setRows((data ?? []) as Row[]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Calcular] Error al cargar planilla quincenal', message);
        if (shouldUseDemoMode) {
          const mock = buildMockRows(currentSucursalId, currentSucursalName);
          setRows(mock);
          setIsDemo(true);
          setDemoReason(message);
          setError('');
        } else {
          setRows([]);
          setError(message || 'No se pudo cargar la planilla quincenal.');
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
        setLastUpdated(new Date());
      }
    },
    [clearIntervalRef, currentSucursalId, currentSucursalName]
  );

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    clearIntervalRef();
    if (!autoRefresh || !currentSucursalId) {
      return;
    }
    const id = setInterval(() => {
      void fetchRows({ silent: true });
    }, 60_000);
    intervalRef.current = id;
    return () => {
      clearInterval(id);
    };
  }, [autoRefresh, clearIntervalRef, currentSucursalId, fetchRows]);

  useEffect(() => () => clearIntervalRef(), [clearIntervalRef]);

  const handleRefresh = useCallback(() => {
    void fetchRows();
  }, [fetchRows]);

  const handleDownloadCsv = useCallback(() => {
    if (!rows.length || typeof window === 'undefined') return;

    const header = [
      'Empleado',
      'Sucursal',
      'Salario base',
      'Bruto quincenal',
      'Seguro social',
      'Seguro educativo',
      'Total deducciones',
      'Neto quincenal',
    ];

    const csvRows = rows.map((row) =>
      [
        toCsvValue(row.empleado),
        toCsvValue(row.sucursal),
        toCsvValue(row.salario_base),
        toCsvValue(row.salario_quincenal),
        toCsvValue(row.seguro_social),
        toCsvValue(row.seguro_educativo),
        toCsvValue(row.total_deducciones),
        toCsvValue(row.salario_neto_quincenal),
      ].join(',')
    );

    const csvContent = [header.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    const safeName = currentSucursalName ? currentSucursalName.replace(/\s+/g, '-').toLowerCase() : 'planilla';
    link.download = `planilla-quincenal-${safeName}.csv`;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, [currentSucursalName, rows]);

  const handleToggleAutoRefresh = useCallback(() => {
    setAutoRefresh((prev) => !prev);
  }, []);

  const handleSucursalChange: React.ChangeEventHandler<HTMLSelectElement> = useCallback(
    (event) => {
      const nextId = event.target.value;
      const nextSucursal = sucursales.find((s) => String(s.id) === String(nextId)) ?? null;
      setSucursalSeleccionada(nextSucursal);
      if (typeof window !== 'undefined') {
        if (nextId) {
          window.localStorage.setItem('selectedSucursalId', nextId);
        } else {
          window.localStorage.removeItem('selectedSucursalId');
        }
      }
    },
    [setSucursalSeleccionada, sucursales]
  );

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return '';
    try {
      return lastUpdated.toLocaleString('es-PA', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (err) {
      console.error('[Calcular] No se pudo formatear fecha', err);
      return lastUpdated.toISOString();
    }
  }, [lastUpdated]);

  const showEmptyState = !loading && !error && !!currentSucursalId && rows.length === 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Planilla quincenal</h1>
          <p className="text-sm text-slate-600">Consulta directa de Supabase · payroll_detalle_quincena.</p>
          {lastUpdatedLabel && (
            <p className="mt-2 text-xs text-slate-500">Última actualización: {lastUpdatedLabel}</p>
          )}
          {isDemo && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700">
              <AlertCircle className="h-3 w-3" />
              Modo demo activo{demoReason ? ` · ${demoReason}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {sucursales.length > 0 ? (
            <label className="flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2 text-sm text-slate-700 shadow-inner">
              <Building2 className="h-4 w-4 text-slate-500" />
              <select
                value={currentSucursalId ?? ''}
                onChange={handleSucursalChange}
                className="bg-transparent text-sm focus:outline-none"
              >
                <option value="" disabled>
                  Selecciona sucursal
                </option>
                {sucursales.map((sucursal) => (
                  <option key={String(sucursal.id)} value={String(sucursal.id)}>
                    {sucursal.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-sm text-slate-500">Sin sucursales disponibles</span>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refrescar
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              disabled={!rows.length}
            >
              <Download className="h-4 w-4" />
              CSV
            </button>

            <button
              type="button"
              onClick={handleToggleAutoRefresh}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition ${
                autoRefresh ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'border text-slate-700 hover:bg-slate-50'
              }`}
              aria-pressed={autoRefresh}
            >
              {autoRefresh ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              Auto-refresh
            </button>
          </div>
        </div>
      </div>

      {!currentSucursalId ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-600 shadow-sm">
          Selecciona una sucursal para ver la planilla quincenal.
        </div>
      ) : loading ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-slate-500" />
          <p className="text-sm text-slate-600">Cargando planilla…</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border-l-4 border-red-500 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <p className="font-medium">{error}</p>
          </div>
        </div>
      ) : showEmptyState ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-600 shadow-sm">
          No hay empleados con planilla generada para esta sucursal.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <details key={row.empleado_id} className="group rounded-2xl border bg-white p-5 shadow-sm">
              <summary className="flex cursor-pointer list-none flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-900">{row.empleado}</p>
                  <p className="text-sm text-slate-500">Neto quincenal: {formatCurrency(row.salario_neto_quincenal)}</p>
                </div>
                <div className="text-sm text-slate-500 md:text-right">
                  <p>Bruto: {formatCurrency(row.salario_quincenal)}</p>
                  <p>Deducciones: {formatCurrency(row.total_deducciones)}</p>
                </div>
              </summary>

              <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span>Salario base</span>
                  <span className="font-medium text-slate-900">{formatCurrency(row.salario_base)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span>Bruto quincenal</span>
                  <span className="font-medium text-slate-900">{formatCurrency(row.salario_quincenal)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span>Seguro social (9.75%)</span>
                  <span className="font-medium text-slate-900">{formatCurrency(row.seguro_social)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span>Seguro educativo (1.25%)</span>
                  <span className="font-medium text-slate-900">{formatCurrency(row.seguro_educativo)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3 md:col-span-2">
                  <span>Total deducciones</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(row.total_deducciones)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 md:col-span-2">
                  <span>Neto quincenal</span>
                  <span className="font-semibold text-emerald-700">{formatCurrency(row.salario_neto_quincenal)}</span>
                </div>
              </div>
            </details>
          ))}

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Totales</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500">Empleados</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{totals.empleados}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500">Bruto total</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totals.bruto)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500">Deducciones</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totals.deducciones)}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-emerald-600">Neto total</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-700">{formatCurrency(totals.neto)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
