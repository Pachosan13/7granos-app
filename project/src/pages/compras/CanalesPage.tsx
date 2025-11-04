import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Table,
  UploadCloud,
} from 'lucide-react';
import { supabase, shouldUseDemoMode, isSupabaseConfigured } from '../../lib/supabase';
import { formatCurrencyUSD } from '../../lib/format';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { ToastContainer, ToastItem, createToast, dismissToast } from '../../components/Toast';

/* ────────────────────────────────────────────────────────────────────────────
   Tipos
--------------------------------------------------------------------------- */

interface ParsedRow {
  proveedor: string;          // Texto del canal detectado (p.ej., "PedidosYa")
  sucursal_slug: string;      // slug/alias de sucursal (p.ej., "costa")
  fecha: string;              // YYYY-MM-DD
  subtotal: number;           // ≈ bruto (antes de impuesto/comisión)
  itbms: number;              // impuesto si aplica (o 0)
  total: number;              // total neto reportado
  referencia?: string | null; // id de reporte/factura
  raw?: Record<string, unknown> | null;
}

interface IngestResponse {
  ok: boolean;
  upserted?: number;
  message?: string;
}

interface ParseResponse {
  ok: boolean;
  rows?: ParsedRow[];
  warnings?: string[];
  message?: string;
}

// Coincide con columnas de ext_ventas_canal + relaciones
interface CanalRecord {
  id: string;
  fecha: string;
  subtotal: number;
  itbms: number;
  total: number;
  referencia: string | null;
  proveedor_nombre: string | null;
  sucursal_id: string | null;
  sucursal_nombre: string | null;
  raw: Record<string, unknown> | null;
}

interface Range { desde: string; hasta: string; }

const CANAL_OPTIONS = ['Todos', 'PedidosYa', 'UberEats', 'DidiFood', 'Glovo', 'Otro'] as const;
type CanalOption = (typeof CANAL_OPTIONS)[number];

/* ────────────────────────────────────────────────────────────────────────────
   Helpers fecha / formato
--------------------------------------------------------------------------- */

function todayIso() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function addDays(base: string, offset: number) {
  const parsed = new Date(`${base}T00:00:00`);
  parsed.setDate(parsed.getDate() + offset);
  return parsed.toISOString().slice(0, 10);
}

function lastSixtyDayRange(): Range {
  const hasta = todayIso();
  const desde = addDays(hasta, -59);
  return { desde, hasta };
}

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Formato de archivo inválido.'));
        return;
      }
      const [, base64] = result.split(',');
      resolve(base64 ?? result);
    };
    reader.readAsDataURL(file);
  });
}

function money(n: number | null | undefined) {
  return formatCurrencyUSD(Number.isFinite(n ?? 0) ? (n ?? 0) : 0);
}

/* ────────────────────────────────────────────────────────────────────────────
   Datos demo (coinciden con subtotal/itbms/total)
--------------------------------------------------------------------------- */
const demoParsed: ParsedRow[] = [
  {
    proveedor: 'PedidosYa',
    sucursal_slug: 'costa',
    fecha: addDays(todayIso(), -2),
    subtotal: 280.45,
    itbms: 0,
    total: 280.45,
    referencia: 'SIM-001',
    raw: { fuente: 'demo' },
  },
  {
    proveedor: 'PedidosYa',
    sucursal_slug: 'costa',
    fecha: addDays(todayIso(), -1),
    subtotal: 305.9,
    itbms: 0,
    total: 305.9,
    referencia: 'SIM-002',
    raw: { fuente: 'demo' },
  },
];

const demoRecords: CanalRecord[] = demoParsed.map((r, i) => ({
  id: `demo-${i}`,
  fecha: r.fecha,
  subtotal: r.subtotal,
  itbms: r.itbms,
  total: r.total,
  referencia: r.referencia ?? null,
  proveedor_nombre: r.proveedor,
  sucursal_id: r.sucursal_slug,
  sucursal_nombre: r.sucursal_slug,
  raw: r.raw ?? null,
}));

function sum(records: CanalRecord[], pick: (r: CanalRecord) => number) {
  return records.reduce((acc, r) => acc + pick(r), 0);
}

/* ────────────────────────────────────────────────────────────────────────────
   Componente principal
--------------------------------------------------------------------------- */

export default function CanalesPage() {
  const { sucursales, sucursalSeleccionada, setSucursalSeleccionada, isAdmin } = useAuthOrg();

  const [selectedCanal, setSelectedCanal] = useState<CanalOption>('PedidosYa');
  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(sucursalSeleccionada?.id ?? null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [ingesting, setIngesting] = useState(false);

  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [records, setRecords] = useState<CanalRecord[]>([]);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = useCallback((t: Omit<ToastItem, 'id'>) => createToast(setToasts, t), []);
  const closeToast = useCallback((id: string) => dismissToast(setToasts, id), []);

  const range = useMemo(() => lastSixtyDayRange(), []);
  const sucursalesOptions = useMemo(() => sucursales ?? [], [sucursales]);

  useEffect(() => {
    if (!sucursalSeleccionada?.id) return;
    setSelectedSucursalId(sucursalSeleccionada.id);
  }, [sucursalSeleccionada?.id]);

  /* ───────────────  Cargar historial  ─────────────── */
  const refreshList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      if (shouldUseDemoMode || !isSupabaseConfigured) {
        setRecords(demoRecords);
        return;
      }

      // Selección con relaciones a proveedor y sucursal
      let q = supabase
        .from('ext_ventas_canal')
        .select(
          'id, fecha, subtotal, itbms, total, referencia, raw, proveedor:ext_ventas_proveedor(id,nombre), sucursal:sucursal(id,nombre)'
        )
        .gte('fecha', range.desde)
        .lte('fecha', range.hasta)
        .order('fecha', { ascending: false })
        .limit(200);

      if (selectedSucursalId) q = q.eq('sucursal_id', selectedSucursalId);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const mapped: CanalRecord[] = (data ?? []).map((row: any) => ({
        id: row.id,
        fecha: row.fecha,
        subtotal: Number(row.subtotal) || 0,
        itbms: Number(row.itbms) || 0,
        total: Number(row.total) || 0,
        referencia: row.referencia ?? null,
        proveedor_nombre: row.proveedor?.nombre ?? null,
        sucursal_id: row.sucursal?.id ?? selectedSucursalId ?? null,
        sucursal_nombre: row.sucursal?.nombre ?? null,
        raw: row.raw ?? null,
      }));

      const filtered =
        selectedCanal !== 'Todos'
          ? mapped.filter(
              (r) => (r.proveedor_nombre ?? '').toLowerCase() === selectedCanal.toLowerCase()
            )
          : mapped;

      setRecords(filtered);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo cargar el historial.';
      setRecords([]);
      setListError(msg);
      pushToast({ title: 'Error cargando registros', description: msg, tone: 'error' });
    } finally {
      setListLoading(false);
    }
  }, [range.desde, range.hasta, selectedCanal, selectedSucursalId, pushToast]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  /* ───────────────  Parse de PDF  ─────────────── */
  const handleFile = useCallback((f: File | null) => {
    setFile(f);
    setPreview([]);
  }, []);

  const handleParse = useCallback(async () => {
    if (!file) {
      pushToast({ title: 'Selecciona un PDF', description: 'Selecciona un archivo para procesar.', tone: 'warning' });
      return;
    }
    if (!selectedSucursalId) {
      pushToast({ title: 'Selecciona una sucursal', description: 'Necesitas elegir la sucursal destino.', tone: 'warning' });
      return;
    }

    setParsing(true);
    try {
      if (shouldUseDemoMode || !isSupabaseConfigured) {
        setPreview(demoParsed);
        pushToast({
          title: 'Modo demo',
          description: 'Se generaron filas de ejemplo porque Supabase no está configurado.',
          tone: 'info',
        });
        return;
      }

      const base64 = await toBase64(file);
      const payload = {
        base64,
        canal: selectedCanal,
        sucursal_id: selectedSucursalId,
        file_name: file.name,
      };

      const { data, error } = await supabase.functions.invoke<ParseResponse>('ext-canal-parse-pdf', {
        body: payload,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? 'El parser no devolvió resultado.');

      // Normalizamos a las columnas reales (subtotal/itbms/total)
      const rows = (data.rows ?? []).map((r: any) => ({
        proveedor: r.proveedor,
        sucursal_slug: r.sucursal_slug,
        fecha: r.fecha,
        subtotal: Number(r.subtotal ?? r.bruto ?? 0),
        itbms: Number(r.itbms ?? 0),
        total: Number(r.total ?? r.neto ?? r.subtotal ?? 0),
        referencia: r.referencia ?? null,
        raw: r.raw ?? null,
      })) as ParsedRow[];

      setPreview(rows);

      if (data.warnings?.length) {
        pushToast({ title: 'Parser con advertencias', description: data.warnings.join('\n'), tone: 'warning' });
      } else {
        pushToast({
          title: 'PDF procesado',
          description: `Se detectaron ${rows.length} filas listas para ingerir.`,
          tone: 'success',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo parsear el PDF.';
      pushToast({ title: 'Error al parsear', description: msg, tone: 'error' });
    } finally {
      setParsing(false);
    }
  }, [file, selectedCanal, selectedSucursalId, pushToast]);

  /* ───────────────  Ingesta  ─────────────── */
  const handleIngest = useCallback(async () => {
    if (!preview.length) {
      pushToast({ title: 'Sin filas para ingerir', description: 'Primero procesa un PDF para obtener filas.', tone: 'warning' });
      return;
    }

    setIngesting(true);
    try {
      if (shouldUseDemoMode || !isSupabaseConfigured) {
        pushToast({ title: 'Modo demo', description: 'Se omite la ingesta en modo demo.', tone: 'info' });
        setPreview([]);
        return;
      }

      // La función de ingesta espera { rows: ParsedRow[] } (con subtotal/itbms/total)
      const { data, error } = await supabase.functions.invoke<IngestResponse>('ext-canal-ingest', {
        body: { rows: preview },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? 'No se pudo guardar.');

      pushToast({
        title: 'Ingesta completada',
        description: `${data.upserted ?? preview.length} filas guardadas exitosamente.`,
        tone: 'success',
      });
      setPreview([]);
      setFile(null);
      await refreshList();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar en la base de datos.';
      pushToast({ title: 'Error al guardar', description: msg, tone: 'error' });
    } finally {
      setIngesting(false);
    }
  }, [preview, refreshList, pushToast]);

  /* ───────────────  Totales y estado  ─────────────── */
  const totals = useMemo(
    () => ({
      subtotal: sum(records, (r) => r.subtotal),
      itbms: sum(records, (r) => r.itbms),
      total: sum(records, (r) => r.total),
    }),
    [records]
  );

  const emptyState = !listLoading && records.length === 0;

  /* ────────────────────────────────────────────────────────────────────────────
     Render
  --------------------------------------------------------------------------- */
  return (
    <div className="space-y-8 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bean">Canales externos</h1>
          <p className="text-sm text-slate-600">
            Sube reportes en PDF (PedidosYa) para registrar ventas y comisiones por sucursal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-col text-sm text-slate-600">
            <span className="mb-1 font-medium text-slate-500">Canal</span>
            <select
              value={selectedCanal}
              onChange={(e) => setSelectedCanal(e.target.value as CanalOption)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {CANAL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          {isAdmin ? (
            <label className="flex flex-col text-sm text-slate-600">
              <span className="mb-1 font-medium text-slate-500">Sucursal</span>
              <select
                value={selectedSucursalId ?? ''}
                onChange={(e) => {
                  const value = e.target.value || null;
                  setSelectedSucursalId(value);
                  const branch = sucursalesOptions.find((s) => s.id === value) ?? null;
                  setSucursalSeleccionada(branch ?? null);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="">Todas</option>
                {sucursalesOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600">
              <Table className="h-4 w-4" />
              {sucursalesOptions.find((x) => x.id === selectedSucursalId)?.nombre ?? 'Sucursal asignada'}
            </div>
          )}
        </div>
      </div>

      {(shouldUseDemoMode || !isSupabaseConfigured) && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            <p className="font-medium">Modo demo activo</p>
            <p>Supabase no está configurado. Se mostrarán filas simuladas y la ingesta se omite.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        {/* ───────────── Upload / Parse / Ingesta ───────────── */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="flex items-center gap-3 text-slate-700">
            <UploadCloud className="h-5 w-5 text-accent" />
            <div>
              <h2 className="text-lg font-semibold">Subir reporte (PDF)</h2>
              <p className="text-sm text-slate-500">Acepta archivos PedidosYa para desglosar ventas por día.</p>
            </div>
          </header>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600 transition hover:border-accent hover:bg-accent/5">
            <UploadCloud className="h-8 w-8 text-accent" />
            <div>
              <p className="font-medium">Arrastra el PDF o haz click para seleccionar</p>
              <p className="text-xs text-slate-500">Solo se utiliza en el navegador para extraer los totales.</p>
            </div>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {file && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                <div className="flex-1 truncate">
                  <p className="truncate font-medium text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleFile(null)}
                  className="text-xs font-medium text-rose-600 hover:underline"
                >
                  Quitar
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleParse}
              disabled={parsing || !file}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Parsear PDF
            </button>
            <button
              type="button"
              onClick={handleIngest}
              disabled={ingesting || preview.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {ingesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Guardar filas
            </button>
          </div>

          {preview.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Database className="h-4 w-4 text-accent" />
                Vista previa ({preview.length} filas)
              </div>
              <div className="max-h-64 overflow-auto rounded-xl border border-slate-100">
                <table className="min-w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Sucursal</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                      <th className="px-3 py-2 text-right">ITBMS</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2">Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={`${r.fecha}-${r.referencia ?? i}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-700">{r.fecha}</td>
                        <td className="px-3 py-2">{r.sucursal_slug}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{money(r.subtotal)}</td>
                        <td className="px-3 py-2 text-right">{money(r.itbms)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{money(r.total)}</td>
                        <td className="px-3 py-2">{r.referencia ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ───────────── Historial / KPIs ───────────── */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-700">
                <Table className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="text-lg font-semibold">Historial (60 días)</h2>
                  <p className="text-xs text-slate-500">
                    Rango {range.desde} → {range.hasta}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={refreshList}
                disabled={listLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {listLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refrescar
              </button>
            </header>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="text-slate-500">Subtotal</p>
                <p className="text-lg font-semibold text-slate-800">{money(totals.subtotal)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="text-slate-500">ITBMS</p>
                <p className="text-lg font-semibold">{money(totals.itbms)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="text-slate-500">Total</p>
                <p className="text-lg font-semibold text-emerald-600">{money(totals.total)}</p>
              </div>
            </div>

            {listError && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <ShieldAlert className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium">No se pudo cargar el historial</p>
                  <p>{listError}</p>
                </div>
              </div>
            )}

            <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    <th className="px-3 py-2 text-right">ITBMS</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {listLoading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                        Cargando registros…
                      </td>
                    </tr>
                  ) : emptyState ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                        No hay registros para mostrar.
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-700">{r.fecha}</td>
                        <td className="px-3 py-2">{r.sucursal_nombre ?? '—'}</td>
                        <td className="px-3 py-2">{r.proveedor_nombre ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{money(r.subtotal)}</td>
                        <td className="px-3 py-2 text-right">{money(r.itbms)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{money(r.total)}</td>
                        <td className="px-3 py-2">{r.referencia ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <ToastContainer toasts={toasts} onDismiss={closeToast} />
    </div>
  );
}
