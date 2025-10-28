import { useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, UploadCloud } from 'lucide-react';
import { UploadZone } from '../../components/UploadZone';
import { ToastContainer, ToastItem, createToast, dismissToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { safeParseCSV } from '../../lib/csv/parse';
import { autoMapColumns, applyColumnMapping, validateMappedData } from '../../lib/csv/columnMapper';

interface PreviewRow {
  categoria: string;
  descripcion: string;
  periodo: string;
  monto: number;
  estado?: string;
}

type PreviewState = {
  rows: PreviewRow[];
  totalRows: number;
  validRows: number;
  warnings: string[];
  errors: string[];
};

const REQUIRED_FIELDS = ['categoria', 'descripcion', 'periodo', 'monto'];

export default function GastosFijosImportar() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const pushToast = (toast: Omit<ToastItem, 'id'>) => createToast(setToasts, toast);

  const handleFile = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      const message = 'Debe ser un archivo CSV';
      setError(message);
      pushToast({ title: 'Formato inválido', tone: 'error', description: message });
      return;
    }

    setParsing(true);
    setFile(selectedFile);
    setPreview(null);
    setError('');

    try {
      const { rows, fields, warnings } = await safeParseCSV(selectedFile);
      const { mappings, missing } = autoMapColumns(fields, 'compras');
      if (missing.length > 0) {
        const message = `Faltan columnas: ${missing.join(', ')}`;
        setError(message);
        pushToast({ title: 'Columnas faltantes', tone: 'error', description: message });
        return;
      }

      const mapped = applyColumnMapping(rows, mappings) as PreviewRow[];
      const errors = validateMappedData(mapped as any[], 'compras');

      const withDefaults = mapped.map((row) => ({
        categoria: String(row.categoria ?? row.proveedor ?? 'Sin categoría'),
        descripcion: String(row.descripcion ?? row.factura ?? 'Sin descripción'),
        periodo: String(row.periodo ?? row.fecha ?? '').slice(0, 7),
        monto: Number(row.monto ?? row.total ?? 0),
        estado: String(row.estado ?? 'pendiente'),
      }));

      const previewData: PreviewState = {
        rows: withDefaults.slice(0, 50),
        totalRows: withDefaults.length,
        validRows: withDefaults.filter((row) =>
          REQUIRED_FIELDS.every((key) => String((row as any)[key] ?? '').trim() !== '')
        ).length,
        warnings,
        errors,
      };

      setPreview(previewData);
      pushToast({
        title: 'Archivo procesado',
        tone: 'success',
        description: `Se identificaron ${previewData.validRows} filas válidas de ${previewData.totalRows}.`,
      });
    } catch (err: any) {
      console.error('parse gastos fijos', err);
      const message = `Error parseando CSV: ${err?.message ?? 'Revisa el archivo'}`;
      setError(message);
      pushToast({ title: 'No se pudo leer el archivo', tone: 'error', description: message });
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      pushToast({ title: 'Gastos listos para cargar', tone: 'info', description: 'Integra este CSV al backend cuando esté disponible.' });
      setShowConfirm(false);
      setPreview(null);
      setFile(null);
    } finally {
      setSaving(false);
    }
  };

  const applyDisabled = !preview || preview.validRows === 0 || preview.errors.length > 0;

  return (
    <div className="p-8">
      <ToastContainer toasts={toasts} onDismiss={(id) => dismissToast(setToasts, id)} />
      <div className="mx-auto max-w-4xl">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-bean">Importar gastos fijos</h1>
          <p className="text-slate7g">Carga y valida gastos recurrentes antes de sincronizarlos.</p>
        </header>

        <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">1. Sube tu CSV</h2>
          <p className="text-sm text-slate-600">
            Columnas sugeridas: categoria, descripcion, periodo (YYYY-MM), monto, estado.
          </p>
          <UploadZone
            accept=".csv,text/csv"
            disabled={parsing}
            onFileSelected={handleFile}
            description="Máximo 5MB. Se valida localmente, no se sube a Supabase todavía."
          />
          {parsing && (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Procesando…
            </div>
          )}
          {file && !parsing && (
            <p className="mt-4 text-sm text-slate-500">Archivo seleccionado: <strong>{file.name}</strong></p>
          )}
        </section>

        {preview && (
          <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">2. Revisa la vista previa</h2>
            <p className="text-sm text-slate-600">
              Se muestran hasta 50 filas. Corrige los errores antes de aplicar.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-700">
                Total filas: <strong>{preview.totalRows}</strong>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
                Filas válidas: <strong>{preview.validRows}</strong>
              </div>
              <div className="rounded-2xl bg-yellow-50 p-4 text-sm text-yellow-700">
                Advertencias: <strong>{preview.warnings.length}</strong>
              </div>
            </div>

            {preview.errors.length > 0 && (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4" /> Errores a corregir
                </div>
                <ul className="mt-2 list-disc list-inside space-y-1">
                  {preview.errors.slice(0, 5).map((issue, idx) => (
                    <li key={`err-${idx}`}>{issue}</li>
                  ))}
                  {preview.errors.length > 5 && <li>…y {preview.errors.length - 5} más</li>}
                </ul>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4" /> Advertencias
                </div>
                <ul className="mt-2 list-disc list-inside space-y-1">
                  {preview.warnings.slice(0, 5).map((issue, idx) => (
                    <li key={`warn-${idx}`}>{issue}</li>
                  ))}
                  {preview.warnings.length > 5 && <li>…y {preview.warnings.length - 5} más</li>}
                </ul>
              </div>
            )}

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
                  {preview.rows.map((row, idx) => (
                    <tr key={idx} className="border-t border-slate-100 odd:bg-white even:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{row.categoria}</td>
                      <td className="px-4 py-3 text-slate-600">{row.descripcion}</td>
                      <td className="px-4 py-3 text-slate-600">{row.periodo}</td>
                      <td className="px-4 py-3 text-right text-slate-700">S/ {Number(row.monto || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-600">{row.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowConfirm(true)}
                disabled={applyDisabled}
                className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                  applyDisabled
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400'
                }`}
              >
                {saving ? 'Guardando…' : 'Marcar como listo'}
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!preview && !file && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center text-sm text-slate-600">
            <UploadCloud className="mx-auto mb-4 h-10 w-10 text-slate-400" />
            Sube un CSV para comenzar. Puedes exportarlo desde tu proveedor de servicios o ERP.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="¿Marcar CSV como listo?"
        description="Se guardará la previsualización en memoria local. Aún necesitas integrar con Supabase para persistirla."
        confirmLabel={saving ? 'Procesando…' : 'Confirmar'}
        onCancel={() => {
          if (!saving) setShowConfirm(false);
        }}
        loading={saving}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
