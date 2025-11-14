import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { formatCurrencyUSD } from '../../lib/format';
import { formatDateIso } from './rpcHelpers';

interface AuxiliarRawRow {
  id?: string;
  invoice_no?: string;
  invoiceNo?: string;
  vendor_id?: string;
  vendorId?: string;
  vendor?: { name?: string | null } | null;
  vendor_name?: string | null;
  vendorName?: string | null;
  sucursal_id?: string | null;
  sucursalId?: string | null;
  date?: string;
  due_date?: string | null;
  dueDate?: string | null;
  subtotal?: number | string | null;
  itbms?: number | string | null;
  total?: number | string | null;
  status?: string | null;
  source?: string | null;
}

interface AuxiliarRow {
  id: string;
  invoiceNo: string;
  vendorId: string | null;
  vendorName: string;
  sucursalId: string | null;
  date: string;
  dueDate: string | null;
  subtotal: number;
  itbms: number;
  total: number;
  status: string;
  source: string | null;
}

interface VendorOption {
  id: string;
  name: string;
}

const normalizeRow = (row: AuxiliarRawRow): AuxiliarRow => {
  const invoiceNo = row.invoice_no || row.invoiceNo || '';
  const vendorId = row.vendor_id || row.vendorId || null;
  const vendorName =
    row.vendor_name ||
    row.vendorName ||
    row.vendor?.name ||
    '';
  const sucursalId = row.sucursal_id ?? row.sucursalId ?? null;
  const date = row.date || '';
  const dueDate = row.due_date ?? row.dueDate ?? null;
  const subtotal = Number(row.subtotal ?? 0) || 0;
  const itbms = Number(row.itbms ?? 0) || 0;
  const total = Number(row.total ?? 0) || 0;
  const status = (row.status || 'OPEN').toUpperCase();
  const source = row.source ?? null;

  return {
    id: row.id ? String(row.id) : invoiceNo || Math.random().toString(36),
    invoiceNo: String(invoiceNo),
    vendorId: vendorId ? String(vendorId) : null,
    vendorName: vendorName ? String(vendorName) : 'Sin proveedor',
    sucursalId: sucursalId ? String(sucursalId) : null,
    date: date ? date.slice(0, 10) : '',
    dueDate: dueDate ? dueDate.slice(0, 10) : null,
    subtotal,
    itbms,
    total,
    status,
    source,
  };
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'OPEN', label: 'Pendientes' },
  { value: 'PAID', label: 'Pagados' },
  { value: 'VOID', label: 'Anulados' },
];

const getStatusBadge = (status: string) => {
  const normalized = status.toUpperCase();
  if (normalized === 'OPEN') {
    return 'bg-amber-100 text-amber-700';
  }
  if (normalized === 'PAID') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (normalized === 'VOID') {
    return 'bg-slate-200 text-slate-600';
  }
  return 'bg-slate-100 text-slate-600';
};

const PAGE_SIZE = 40;

export const AuxiliaresTab = () => {
  const { sucursales } = useAuthOrg();
  const [searchParams, setSearchParams] = useSearchParams();

  const [desde, setDesde] = useState(() => searchParams.get('aux_desde') ?? new Date().toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(() => searchParams.get('aux_hasta') ?? new Date().toISOString().slice(0, 10));
  const [selectedSucursal, setSelectedSucursal] = useState(() => searchParams.get('aux_sucursal') ?? '');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('aux_status') ?? 'OPEN');
  const [vendorFilter, setVendorFilter] = useState(() => searchParams.get('aux_vendor') ?? '');
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [rows, setRows] = useState<AuxiliarRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const sucursalMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const sucursal of sucursales) {
      map[sucursal.id] = sucursal.nombre;
    }
    return map;
  }, [sucursales]);

  useEffect(() => {
    (async () => {
      const { data, error: fetchError } = await supabase
        .from('vendor')
        .select('id,name,active')
        .order('name', { ascending: true });

      if (fetchError) {
        console.warn('[contabilidad] error cargando proveedores', fetchError);
        return;
      }

      const options = (data ?? [])
        .filter((row: any) => row.active !== false)
        .map((row: any) => ({ id: String(row.id), name: String(row.name ?? 'Sin nombre') }));
      setVendors(options);
    })();
  }, []);

  const syncParams = useCallback(
    (next: Record<string, string | null | undefined>) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set('tab', 'auxiliares');
        Object.entries(next).forEach(([key, value]) => {
          if (!value) {
            params.delete(key);
          } else {
            params.set(key, value);
          }
        });
        return params;
      });
    },
    [setSearchParams]
  );

  const fetchData = useCallback(async () => {
    if (!desde || !hasta) return;
    setLoading(true);
    setError(null);
    syncParams({
      aux_desde: desde,
      aux_hasta: hasta,
      aux_sucursal: selectedSucursal || null,
      aux_status: statusFilter || null,
      aux_vendor: vendorFilter || null,
    });

    try {
      let query = supabase
        .from('ap_invoice')
        .select('id,invoice_no,vendor_id,sucursal_id,date,due_date,subtotal,itbms,total,status,source,vendor:vendor_id(name)', {
          count: 'exact',
        })
        .gte('date', desde)
        .lte('date', hasta)
        .order('date', { ascending: false })
        .limit(2000);

      if (selectedSucursal) {
        query = query.eq('sucursal_id', selectedSucursal);
      }
      if (statusFilter && statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }
      if (vendorFilter) {
        query = query.eq('vendor_id', vendorFilter);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) {
        throw fetchError;
      }

      const normalized = (data as AuxiliarRawRow[] | null)?.map(normalizeRow) ?? [];
      setRows(normalized);
    } catch (err: unknown) {
      console.error('[contabilidad] error cargando auxiliares', err);
      const message =
        err instanceof Error
          ? err.message
          : 'No fue posible obtener los auxiliares de proveedores.';
      setRows([]);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, selectedSucursal, statusFilter, vendorFilter, syncParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [desde, hasta, selectedSucursal, statusFilter, vendorFilter]);

  const paginatedRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page]
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const totals = useMemo(() => {
    const now = new Date();
    const sevenDaysAhead = new Date(now);
    sevenDaysAhead.setDate(now.getDate() + 7);

    return rows.reduce(
      (acc, row) => {
        if (row.status === 'OPEN') {
          acc.open += row.total;
        }
        if (row.status === 'PAID') {
          acc.paid += row.total;
        }
        if (row.status === 'OPEN' && row.dueDate) {
          const due = new Date(row.dueDate);
          if (!Number.isNaN(due.getTime())) {
            if (due < now) {
              acc.overdue += row.total;
            } else if (due <= sevenDaysAhead) {
              acc.dueSoon += row.total;
            }
          }
        }
        return acc;
      },
      { open: 0, paid: 0, overdue: 0, dueSoon: 0 }
    );
  }, [rows]);

  const handlePrev = () => setPage((prev) => Math.max(1, prev - 1));
  const handleNext = () => setPage((prev) => Math.min(totalPages, prev + 1));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-6">
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(event) => setDesde(event.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Hasta
            <input
              type="date"
              value={hasta}
              onChange={(event) => setHasta(event.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Sucursal
            <select
              value={selectedSucursal}
              onChange={(event) => setSelectedSucursal(event.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            >
              <option value="">Todas mis sucursales</option>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Estado
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="md:col-span-2 flex flex-col gap-2 text-sm text-slate7g">
            Proveedor
            <select
              value={vendorFilter}
              onChange={(event) => setVendorFilter(event.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            >
              <option value="">Todos los proveedores</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <button
            type="button"
            onClick={fetchData}
            className="rounded-lg border border-sand px-3 py-1 text-sm text-bean hover:border-bean"
            disabled={loading}
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
          <span>{rows.length} registros en el rango</span>
        </div>
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Saldo pendiente</p>
          <p className="text-2xl font-semibold text-bean">{formatCurrencyUSD(totals.open)}</p>
        </div>
        <div className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pagado</p>
          <p className="text-2xl font-semibold text-emerald-600">{formatCurrencyUSD(totals.paid)}</p>
        </div>
        <div className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Vence en 7 días</p>
          <p className="text-2xl font-semibold text-amber-600">{formatCurrencyUSD(totals.dueSoon)}</p>
        </div>
        <div className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Vencido</p>
          <p className="text-2xl font-semibold text-rose-600">{formatCurrencyUSD(totals.overdue)}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-sand bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-sand text-sm">
            <thead className="bg-off/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Factura</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                <th className="px-4 py-3 text-right">ITBMS</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/70">
              {paginatedRows.map((row) => {
                const dueLabel = row.dueDate ? formatDateIso(row.dueDate) : '—';
                const statusBadge = getStatusBadge(row.status);
                return (
                  <tr key={row.id} className="hover:bg-off/40">
                    <td className="px-4 py-2 text-slate7g">{formatDateIso(row.date)}</td>
                    <td className="px-4 py-2 font-semibold text-slate-800">{row.invoiceNo || '—'}</td>
                    <td className="px-4 py-2 text-slate7g">{row.vendorName}</td>
                    <td className="px-4 py-2 text-slate7g">
                      {row.sucursalId ? sucursalMap[row.sucursalId] ?? row.sucursalId : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm">{formatCurrencyUSD(row.subtotal)}</td>
                    <td className="px-4 py-2 text-right font-mono text-sm">{formatCurrencyUSD(row.itbms)}</td>
                    <td className="px-4 py-2 text-right font-mono text-sm">{formatCurrencyUSD(row.total)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge}`}>
                        {row.status === 'OPEN' && <AlertTriangle className="h-3 w-3" />}
                        {row.status === 'PAID' && <CheckCircle2 className="h-3 w-3" />}
                        {row.status === 'VOID' && <AlertCircle className="h-3 w-3" />}
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate7g">{dueLabel}</td>
                    <td className="px-4 py-2 text-slate7g">
                      {row.source ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          <Building2 className="h-3 w-3" /> {row.source}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando auxiliares…
          </div>
        )}
        {!loading && paginatedRows.length === 0 && !error && (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            No se encontraron auxiliares para los filtros seleccionados.
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-sand px-4 py-3 text-sm text-slate-600">
          <span>
            Página {page} de {totalPages} · {rows.length} registros
          </span>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={page === 1}
              className="inline-flex items-center rounded-lg border border-sand px-3 py-1 text-sm text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={page === totalPages}
              className="inline-flex items-center rounded-lg border border-sand px-3 py-1 text-sm text-slate-600 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};

