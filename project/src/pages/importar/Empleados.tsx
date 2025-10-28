import { useState } from 'react';
import { FileText, AlertCircle, CheckCircle, Users, UserCheck, UserX, Loader2 } from 'lucide-react';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { safeParseCSV } from '../../lib/csv/parse';
import { saveUpload, logSync } from '../../lib/storage/saveUpload';
import { autoMapColumns, applyColumnMapping, validateMappedData } from '../../lib/csv/columnMapper';
import { InlineSucursalSelector } from '../../components/InlineSucursalSelector';
import { Layout } from '../../components/Layout';
import { UploadZone } from '../../components/UploadZone';
import { ToastContainer, ToastItem, createToast, dismissToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const REQUIRED_COLUMNS = ['personal_identification_number', 'first_name', 'last_name', 'employee_rol', 'is_active'];

type CsvPreview = {
  rows: any[];
  allRows: any[];
  fields: string[];
  warnings: string[];
  errors: string[];
  totalRows: number;
  validRows: number;
  stats: {
    totalEmployees: number;
    activeEmployees: number;
    inactiveEmployees: number;
    roleDistribution: Record<string, number>;
  };
};

export const EmpleadosPage = () => {
  const { sucursalSeleccionada, user } = useAuthOrg();
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<CsvPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  const pushToast = (toast: Omit<ToastItem, 'id'>) => createToast(setToasts, toast);

  const handleCSVUpload = async (selectedFile: File) => {
    if (!selectedFile) {
      pushToast({ title: 'Selecciona un archivo', tone: 'warning', description: 'Necesitas elegir un CSV válido.' });
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      const message = 'Debe ser un archivo .csv';
      setError(message);
      pushToast({ title: 'Formato inválido', tone: 'error', description: message });
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      const message = 'El archivo supera 5MB.';
      setError(message);
      pushToast({ title: 'Archivo muy grande', tone: 'error', description: message });
      return;
    }

    setParsing(true);
    setFile(selectedFile);
    setCsvData(null);
    setError('');

    try {
      const { rows, fields, warnings } = await safeParseCSV(selectedFile);

      const { mappings, missing } = autoMapColumns(fields, 'empleados');
      if (missing.length > 0) {
        const message = `Faltan columnas requeridas: ${missing.join(', ')}`;
        setError(message);
        pushToast({ title: 'Columnas faltantes', tone: 'error', description: message });
        return;
      }

      const mappedData = applyColumnMapping(rows, mappings);
      const validationErrors = validateMappedData(mappedData, 'empleados');

      const activeEmployees = mappedData.filter((row) =>
        String(row.is_active || '').toLowerCase() === 'yes'
      ).length;

      const roleDistribution = mappedData.reduce((acc, row) => {
        const role = String(row.employee_rol || 'Sin rol').trim();
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const previewData: CsvPreview = {
        rows: mappedData.slice(0, 100),
        allRows: mappedData,
        fields: Object.keys(mappedData[0] || {}),
        warnings,
        errors: validationErrors,
        totalRows: mappedData.length,
        validRows: mappedData.filter((row) =>
          row.personal_identification_number && row.first_name && row.last_name
        ).length,
        stats: {
          totalEmployees: mappedData.length,
          activeEmployees,
          inactiveEmployees: mappedData.length - activeEmployees,
          roleDistribution,
        },
      };

      setCsvData(previewData);
      pushToast({
        title: 'Archivo procesado',
        tone: 'success',
        description: `Se detectaron ${previewData.validRows} filas válidas de ${previewData.totalRows}.`,
      });

      if (previewData.errors.length > 0) {
        pushToast({
          title: 'Revisa los datos',
          tone: 'warning',
          description: 'Hay campos obligatorios vacíos. Corrige antes de aplicar.',
        });
      }
    } catch (err: any) {
      console.error(err);
      const message = `Error parseando CSV: ${err?.message ?? 'revisa el archivo'}`;
      setError(message);
      pushToast({ title: 'No se pudo leer el archivo', tone: 'error', description: message });
    } finally {
      setParsing(false);
    }
  };

  const handleUpload = async () => {
    if (!file || !csvData || !sucursalSeleccionada || !user) {
      pushToast({
        title: 'Faltan datos',
        tone: 'warning',
        description: 'Selecciona una sucursal y carga un archivo válido antes de confirmar.',
      });
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const { filePath, manifestPath } = await saveUpload(
        file,
        sucursalSeleccionada.id,
        'empleados',
        {
          rows: csvData.totalRows,
          columns: csvData.fields,
          totals: { employeeDetails: csvData.stats },
        },
        csvData.allRows
      );

      await logSync(
        sucursalSeleccionada.id,
        'empleados',
        'csv',
        'ok',
        `CSV de empleados importado: ${file.name} (${csvData.validRows} empleados válidos)`,
        filePath,
        manifestPath
      );

      pushToast({
        title: 'Importación registrada',
        tone: 'success',
        description: 'Se guardó el CSV y se documentó el manifiesto en Supabase.',
      });

      setFile(null);
      setCsvData(null);
      setShowConfirm(false);
    } catch (uploadError) {
      console.error('Error subiendo archivo:', uploadError);
      const message = `Error guardando archivo: ${uploadError instanceof Error ? uploadError.message : 'Error desconocido'}`;
      setError(message);
      pushToast({ title: 'No se pudo guardar', tone: 'error', description: message });
    } finally {
      setIsUploading(false);
    }
  };

  const applyDisabled = !csvData || csvData.validRows === 0 || csvData.errors.length > 0 || parsing;

  return (
    <Layout>
      <ToastContainer toasts={toasts} onDismiss={(id) => dismissToast(setToasts, id)} />
      <div className="max-w-6xl mx-auto">
        {!sucursalSeleccionada && (
          <div className="mb-8 p-6 bg-amber-50 border-l-4 border-amber-400 rounded-xl">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-6 w-6 text-amber-600" />
              <div>
                <h3 className="text-lg font-bold text-amber-900">Selecciona una sucursal</h3>
                <p className="text-amber-700">
                  Necesitas seleccionar una sucursal desde el selector en el encabezado para importar empleados.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-10">
          <h1 className="text-4xl font-bold text-bean mb-4 tracking-tight">Importar Empleados</h1>
          <p className="text-xl text-slate7g leading-relaxed">
            Subir CSV con información de empleados
          </p>
        </div>

        <div className="mb-8">
          <InlineSucursalSelector showLabel={true} />
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-400 rounded-xl p-6 mb-8">
          <h3 className="text-lg font-bold text-blue-900 mb-3">Formato esperado del CSV:</h3>
          <code className="text-sm bg-blue-100 px-3 py-2 rounded-lg font-mono block">
            Personal identification number,Name,Lastname,Employee Rol,Active? (Yes/No)[,Email,...]
          </code>
          <p className="text-blue-700 mt-3 leading-relaxed">
            Las columnas <strong>Personal identification number</strong>, <strong>Name</strong>,
            <strong>Lastname</strong>, <strong>Employee Rol</strong> y <strong>Active? (Yes/No)</strong> son obligatorias.
            Otras columnas como Email, teléfonos, dirección son opcionales.
          </p>
          <p className="mt-3 text-sm text-blue-600">
            Columnas requeridas detectadas automáticamente: {REQUIRED_COLUMNS.join(', ')}.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-sand p-8 mb-8 transition-all duration-200 hover:shadow-xl">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-bean mb-3">Subir CSV de empleados</h2>
            <p className="text-sm text-slate-600">
              Los datos se validan localmente antes de enviarse a Supabase.
            </p>
          </div>

          <UploadZone
            accept=".csv,text/csv"
            disabled={!sucursalSeleccionada || parsing}
            onFileSelected={handleCSVUpload}
            description="Archivos CSV únicamente (máximo 5MB). La sucursal seleccionada se usa para asociar el manifiesto."
          />
          {parsing && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Procesando archivo…
            </div>
          )}
          {file && !parsing && (
            <p className="mt-4 text-center text-sm text-slate-500">
              Archivo seleccionado: <strong>{file.name}</strong>
            </p>
          )}
        </div>

        {csvData && (
          <div className="bg-white rounded-2xl shadow-lg border border-sand p-8 mb-8 transition-all duration-200 hover:shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-bean">Vista previa del archivo</h3>
              <div className="flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-800 rounded-full font-medium">
                <Users className="h-5 w-5" />
                <span>Empleados</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-4 mb-8">
              <div className="bg-blue-50 p-6 rounded-2xl border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <Users className="h-8 w-8 text-blue-600" />
                  <div className="text-3xl font-bold text-blue-900">{csvData.stats.totalEmployees}</div>
                </div>
                <p className="text-blue-700 font-medium">Total empleados</p>
              </div>

              <div className="bg-green-50 p-6 rounded-2xl border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <UserCheck className="h-8 w-8 text-green-600" />
                  <div className="text-3xl font-bold text-green-900">{csvData.stats.activeEmployees}</div>
                </div>
                <p className="text-green-700 font-medium">Activos</p>
              </div>

              <div className="bg-red-50 p-6 rounded-2xl border border-red-200">
                <div className="flex items-center justify-between mb-2">
                  <UserX className="h-8 w-8 text-red-600" />
                  <div className="text-3xl font-bold text-red-900">{csvData.stats.inactiveEmployees}</div>
                </div>
                <p className="text-red-700 font-medium">Inactivos</p>
              </div>

              <div className="bg-purple-50 p-6 rounded-2xl border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle className="h-8 w-8 text-purple-600" />
                  <div className="text-3xl font-bold text-purple-900">{csvData.validRows}</div>
                </div>
                <p className="text-purple-700 font-medium">Filas válidas</p>
              </div>
            </div>

            {Object.keys(csvData.stats.roleDistribution).length > 0 && (
              <div className="mb-8">
                <h4 className="text-lg font-bold text-bean mb-4">Distribución por roles:</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(csvData.stats.roleDistribution).map(([role, count]) => (
                    <div key={role} className="bg-off p-4 rounded-xl border border-sand">
                      <div className="text-xl font-bold text-bean">{count}</div>
                      <div className="text-sm font-medium text-slate7g">{role}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {csvData.errors.length > 0 && (
              <div className="mb-8 p-4 bg-red-50 border-l-4 border-red-400 rounded-xl">
                <div className="flex items-center space-x-3 mb-3">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="font-semibold text-red-800">Errores a corregir:</span>
                </div>
                <ul className="text-red-700 list-disc list-inside space-y-1">
                  {csvData.errors.slice(0, 5).map((issue, idx) => (
                    <li key={`error-${idx}`} className="font-medium">{issue}</li>
                  ))}
                  {csvData.errors.length > 5 && (
                    <li className="font-medium">…y {csvData.errors.length - 5} más</li>
                  )}
                </ul>
              </div>
            )}

            {csvData.warnings.length > 0 && (
              <div className="mb-8 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-xl">
                <div className="flex items-center space-x-3 mb-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <span className="font-semibold text-yellow-800">Advertencias:</span>
                </div>
                <ul className="text-yellow-700 list-disc list-inside space-y-1">
                  {csvData.warnings.slice(0, 5).map((warning, idx) => (
                    <li key={`warn-${idx}`} className="font-medium">{warning}</li>
                  ))}
                  {csvData.warnings.length > 5 && (
                    <li className="font-medium">…y {csvData.warnings.length - 5} más</li>
                  )}
                </ul>
              </div>
            )}

            {csvData.rows.length > 0 && (
              <div className="mb-8">
                <h4 className="text-lg font-bold text-bean mb-4">Vista previa (primeras filas):</h4>
                <div className="overflow-x-auto rounded-xl border border-sand">
                  <table className="min-w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate7g text-white">
                        <th className="px-4 py-3 text-left font-semibold">Identificación</th>
                        <th className="px-4 py-3 text-left font-semibold">Nombre</th>
                        <th className="px-4 py-3 text-left font-semibold">Apellido</th>
                        <th className="px-4 py-3 text-left font-semibold">Email</th>
                        <th className="px-4 py-3 text-left font-semibold">Rol</th>
                        <th className="px-4 py-3 text-left font-semibold">Activo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.rows.slice(0, 10).map((row, idx) => (
                        <tr
                          key={idx}
                          className={`transition-colors duration-150 hover:bg-accent/10 ${idx % 2 === 0 ? 'bg-white' : 'bg-off/50'}`}
                        >
                          <td className="px-4 py-3 border-t border-sand">
                            {String(row.personal_identification_number || '').slice(0, 20)}
                          </td>
                          <td className="px-4 py-3 border-t border-sand">
                            {String(row.first_name || '').slice(0, 30)}
                          </td>
                          <td className="px-4 py-3 border-t border-sand">
                            {String(row.last_name || '').slice(0, 30)}
                          </td>
                          <td className="px-4 py-3 border-t border-sand">
                            {String(row.email || '').slice(0, 40)}
                          </td>
                          <td className="px-4 py-3 border-t border-sand">
                            {String(row.employee_rol || '').slice(0, 20)}
                          </td>
                          <td className="px-4 py-3 border-t border-sand">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                String(row.is_active || '').toLowerCase() === 'yes'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {String(row.is_active || 'No')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvData.totalRows > 10 && (
                  <p className="text-slate7g mt-4 text-center font-medium">
                    Mostrando las primeras 10 filas de {csvData.totalRows} total
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end mt-8">
              <button
                onClick={() => setShowConfirm(true)}
                disabled={applyDisabled}
                className={`px-8 py-4 font-semibold rounded-2xl transition-all duration-200 transform focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                  applyDisabled
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 hover:scale-105'
                }`}
              >
                {isUploading ? 'Guardando…' : 'Guardar en Supabase'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Confirmar importación"
        description={
          csvData ? (
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                Se guardará el archivo <strong>{file?.name}</strong> con {csvData.validRows} filas válidas en la sucursal
                seleccionada.
              </p>
              <p>
                Este paso solo sube el archivo a Supabase; la integración con nómina depende de procesos backend.
              </p>
            </div>
          ) : null
        }
        confirmLabel={isUploading ? 'Guardando…' : 'Confirmar'}
        onCancel={() => {
          if (!isUploading) setShowConfirm(false);
        }}
        loading={isUploading}
        onConfirm={handleUpload}
      />
    </Layout>
  );
};
