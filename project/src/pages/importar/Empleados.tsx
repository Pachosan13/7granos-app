import { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Users, UserCheck, UserX } from 'lucide-react';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { safeParseCSV } from '../../lib/csv/parse';
import { saveUpload, logSync } from '../../lib/storage/saveUpload';
import { autoMapColumns, applyColumnMapping, validateMappedData } from '../../lib/csv/columnMapper';
import { InlineSucursalSelector } from '../../components/InlineSucursalSelector';
import { Layout } from '../../components/Layout';

const REQUIRED_COLUMNS = ['personal_identification_number', 'first_name', 'last_name', 'employee_rol', 'is_active'];

export const EmpleadosPage = () => {
  const { sucursalSeleccionada, user } = useAuthOrg();
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag & Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleCSVUpload(e.dataTransfer.files[0]);
    }
  };

  const handleCSVUpload = async (selectedFile: File) => {
    if (!selectedFile) {
      setError('No se seleccionó archivo.');
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setError('Debe ser un archivo .csv');
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('El archivo supera 5MB.');
      return;
    }

    setFile(selectedFile);
    setCsvData(null);
    setError('');
    setSuccess('');

    try {
      const { rows, fields, warnings } = await safeParseCSV(selectedFile);
      
      // Auto-mapear columnas
      const { mappings, missing } = autoMapColumns(fields, 'empleados');
      
      if (missing.length > 0) {
        setError(`Faltan columnas requeridas: ${missing.join(', ')}`);
        return;
      }

      // Aplicar mapeo
      const mappedData = applyColumnMapping(rows, mappings);
      
      // Validar datos mapeados
      const validationErrors = validateMappedData(mappedData, 'empleados');
      
      // Calcular estadísticas
      const activeEmployees = mappedData.filter(row => 
        String(row.is_active || '').toLowerCase() === 'yes'
      ).length;
      
      const roleDistribution = mappedData.reduce((acc, row) => {
        const role = String(row.employee_rol || 'Sin rol').trim();
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Preparar datos para vista previa
      const previewData = {
        rows: mappedData.slice(0, 100),
        allRows: mappedData,
        fields: Object.keys(mappedData[0] || {}),
        warnings: [...warnings, ...validationErrors],
        totalRows: mappedData.length,
        validRows: mappedData.filter(row => 
          row.personal_identification_number && 
          row.first_name && 
          row.last_name
        ).length,
        stats: {
          totalEmployees: mappedData.length,
          activeEmployees,
          inactiveEmployees: mappedData.length - activeEmployees,
          roleDistribution
        }
      };

      setCsvData(previewData);

    } catch (err: any) {
      console.error(err);
      setError(`Error parseando CSV: ${err?.message ?? 'revisa el archivo'}`);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleCSVUpload(selectedFile);
    }
    // Limpiar input para permitir re-subir el mismo archivo
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!file || !csvData || !sucursalSeleccionada || !user) {
      return;
    }

    setIsUploading(true);
    setError('');
    
    try {
      // Subir archivo y crear manifiesto
      const { filePath, manifestPath } = await saveUpload(
        file,
        sucursalSeleccionada.id,
        'empleados',
        {
          rows: csvData.totalRows,
          columns: csvData.fields,
          totals: { employeeDetails: csvData.stats }
        },
        csvData.allRows
      );

      // Registrar en sync_log
      await logSync(
        sucursalSeleccionada.id,
        'empleados',
        'csv',
        'ok',
        `CSV de empleados importado: ${file.name} (${csvData.validRows} empleados válidos)`,
        filePath,
        manifestPath
      );

      setSuccess('¡Empleados guardados exitosamente en Supabase!');
      
      // Limpiar formulario
      setFile(null);
      setCsvData(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Error subiendo archivo:', error);
      setError(`Error guardando archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">{!sucursalSeleccionada && (
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
        {/* Enhanced Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-bean mb-4 tracking-tight">Importar Empleados</h1>
          <p className="text-xl text-slate7g leading-relaxed">
            Subir CSV con información de empleados
          </p>
        </div>

        {/* Sucursal Selector */}
        <div className="mb-8">
          <InlineSucursalSelector showLabel={true} />
        </div>

        {/* Enhanced Guía de formato */}
        <div className="bg-blue-50 border-l-4 border-blue-400 rounded-xl p-6 mb-8">
          <h3 className="text-lg font-bold text-blue-900 mb-3">Formato esperado del CSV:</h3>
          <code className="text-sm bg-blue-100 px-3 py-2 rounded-lg font-mono">
            Personal identification number,Name,Lastname,Employee Rol,Active? (Yes/No)[,Email,...]
          </code>
          <p className="text-blue-700 mt-3 leading-relaxed">
            Las columnas <strong>Personal identification number</strong>, <strong>Name</strong>, 
            <strong>Lastname</strong>, <strong>Employee Rol</strong> y <strong>Active? (Yes/No)</strong> son obligatorias.
            Otras columnas como Email, teléfonos, dirección son opcionales.
          </p>
        </div>

        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-lg border border-sand p-8 mb-8 transition-all duration-200 hover:shadow-xl">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-bean mb-3">
              Subir CSV de empleados
            </h2>
          </div>

          {/* Enhanced Zona de drag & drop */}
          <div
            className={`border-3 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
              !sucursalSeleccionada
                ? 'border-gray-300 bg-gray-50 opacity-60 cursor-not-allowed'
                : dragActive
                  ? 'border-accent bg-accent/10 scale-[1.02] shadow-lg'
                  : 'border-sand bg-off/30 hover:border-accent/50 hover:bg-off/50'
            }`}
            onDragEnter={sucursalSeleccionada ? handleDrag : undefined}
            onDragLeave={sucursalSeleccionada ? handleDrag : undefined}
            onDragOver={sucursalSeleccionada ? handleDrag : undefined}
            onDrop={sucursalSeleccionada ? handleDrop : undefined}
          >
            <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-all duration-300 ${
              !sucursalSeleccionada
                ? 'bg-gray-300 text-gray-500'
                : dragActive ? 'bg-accent text-white' : 'bg-accent/20 text-accent'
            }`}>
              <Upload className="h-10 w-10" />
            </div>
            <p className="text-2xl font-bold text-bean mb-3">
              Arrastra tu archivo aquí o haz clic para seleccionar
            </p>
            <p className="text-lg text-slate7g mb-8">
              Archivos CSV únicamente (máximo 5MB)
            </p>

            <button
              onClick={() => sucursalSeleccionada && fileInputRef.current?.click()}
              disabled={!sucursalSeleccionada}
              className={`px-8 py-4 font-semibold rounded-2xl transition-all duration-200 transform focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                !sucursalSeleccionada
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 focus:ring-blue-500'
              }`}
            >
              Seleccionar archivo
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </div>

        {/* Vista previa del archivo */}
        {csvData && (
          <div className="bg-white rounded-2xl shadow-lg border border-sand p-8 mb-8 transition-all duration-200 hover:shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-bean">Vista previa del archivo</h3>
              <div className="flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-800 rounded-full font-medium">
                <Users className="h-5 w-5" />
                <span>Empleados</span>
              </div>
            </div>
            
            {/* Enhanced Estadísticas */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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
                <p className="text-purple-700 font-medium">Válidos</p>
              </div>
            </div>

            {/* Distribución por roles */}
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

            {/* Advertencias */}
            {csvData.warnings.length > 0 && (
              <div className="mb-8 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-xl">
                <div className="flex items-center space-x-3 mb-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <span className="font-semibold text-yellow-800">Advertencias:</span>
                </div>
                <ul className="text-yellow-700 list-disc list-inside space-y-1">
                  {csvData.warnings.slice(0, 5).map((warning: string, idx: number) => (
                    <li key={idx} className="font-medium">{warning}</li>
                  ))}
                  {csvData.warnings.length > 5 && (
                    <li className="font-medium">...y {csvData.warnings.length - 5} más</li>
                  )}
                </ul>
              </div>
            )}

            {/* Vista previa de datos */}
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
                      {csvData.rows.slice(0, 10).map((row: any, idx: number) => (
                        <tr key={idx} className={`transition-colors duration-150 hover:bg-accent/10 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-off/50'
                        }`}>
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
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              String(row.is_active || '').toLowerCase() === 'yes'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
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

            {/* Botón de guardar */}
            <div className="flex justify-end mt-8">
              <button
                onClick={handleUpload}
                disabled={isUploading || csvData.validRows === 0}
                className={`px-8 py-4 font-semibold rounded-2xl transition-all duration-200 transform focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                  isUploading || csvData.validRows === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 hover:scale-105'
                }`}
              >
                {isUploading ? 'Guardando...' : 'Guardar en Supabase'}
              </button>
            </div>
          </div>
        )}

        {/* Mensajes */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border-l-4 border-red-400 rounded-xl">
            <div className="flex items-center space-x-3">
              <AlertCircle className="text-red-500 h-5 w-5" />
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-8 p-4 bg-green-50 border-l-4 border-green-400 rounded-xl">
            <div className="flex items-center space-x-3">
              <CheckCircle className="text-green-500 h-5 w-5" />
              <p className="text-green-700 font-medium">{success}</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};