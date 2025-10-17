import { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Calendar, Clock, Users } from 'lucide-react';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { parseCSV } from '../../lib/csv/parse';
import { saveUpload, logSync } from '../../lib/storage/saveUpload';
import {
  isMarcacionesCSV,
  processMarcacionesCSV,
  marcacionesToPreviewData,
  generateMarcacionesSummary
} from '../../lib/csv/marcacionesProcessor';
import { InlineSucursalSelector } from '../../components/InlineSucursalSelector';
import { Layout } from '../../components/Layout';

interface PeriodSelection {
  mes: number;
  año: number;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const PlanillaPage = () => {
  const { sucursalSeleccionada } = useAuthOrg();
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [marcacionesResult, setMarcacionesResult] = useState<any>(null);
  const [csvType, setCsvType] = useState<'planilla' | 'marcaciones' | null>(null);
  const [period, setPeriod] = useState<PeriodSelection>({
    mes: new Date().getMonth() + 1,
    año: new Date().getFullYear()
  });
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
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
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      alert('Por favor selecciona un archivo CSV válido');
      return;
    }

    setFile(selectedFile);
    setParseResult(null);
    setMarcacionesResult(null);
    setCsvType(null);

    try {
      // Primer parseo para detectar el tipo de CSV
      const initialResult = await parseCSV(selectedFile, 'planilla');
      
      // Detectar si es CSV de marcaciones
      if (isMarcacionesCSV(initialResult.originalHeaders)) {
        setCsvType('marcaciones');
        
        // Procesar como marcaciones
        const marcaciones = processMarcacionesCSV(
          initialResult.originalData, 
          initialResult.originalHeaders
        );
        setMarcacionesResult(marcaciones);
        
        // Crear parseResult compatible para la vista previa
        const previewData = marcacionesToPreviewData(marcaciones);
        setParseResult({
          ...initialResult,
          data: previewData,
          headers: ['empleado', 'total_horas', 'dias_trabajados', 'promedio_horas_dia'],
          mappings: [
            { source: initialResult.originalHeaders[0], target: 'empleado' }
          ],
          unmapped: [],
          missing: [],
          errors: marcaciones.empleados.length === 0 ? ['No se encontraron marcaciones válidas'] : []
        });
      } else {
        setCsvType('planilla');
        // Re-parsear como planilla normal
        const planillaResult = await parseCSV(selectedFile, 'planilla');
        setParseResult(planillaResult);
      }
    } catch (error) {
      console.error('Error parseando CSV:', error);
      alert(`Error parseando CSV: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !parseResult || !sucursalSeleccionada) {
      return;
    }

    // Validar según el tipo de CSV
    if (csvType === 'planilla' && parseResult.missing.length > 0) {
      return;
    }
    if (csvType === 'marcaciones' && !marcacionesResult) {
      return;
    }

    setIsUploading(true);
    
    try {
      let totals: Record<string, number> = {};
      
      if (csvType === 'marcaciones' && marcacionesResult) {
        // Para marcaciones, usar el resumen generado
        const summary = generateMarcacionesSummary(marcacionesResult);
        totals = {
          total_empleados: summary.totalEmpleados,
          total_horas: summary.totalHoras,
          total_dias: summary.totalDias,
          promedio_horas: summary.promedioHoras,
          ...summary.distribucionHoras
        };
      } else {
        // Para planilla normal, calcular totales por código y centro
        const totalsByCode: Record<string, number> = {};
        const totalsByCentro: Record<string, number> = {};

        parseResult.data.forEach((row: any) => {
          const codigo = row.codigo || 'Sin código';
          const monto = parseFloat(row.monto) || 0;
          const centro = row.centro || 'Sin centro';

          totalsByCode[codigo] = (totalsByCode[codigo] || 0) + monto;
          totalsByCentro[centro] = (totalsByCentro[centro] || 0) + monto;
        });

        totals = { ...totalsByCode, ...totalsByCentro };
      }

      // Subir archivo y crear manifiesto
      const { filePath, manifestPath } = await saveUpload(
        file,
        sucursalSeleccionada.id,
        'planilla',
        {
          rows: parseResult.rowCount,
          columns: parseResult.headers,
          period,
          totals
        },
        parseResult.data // ← AGREGAR ESTO: pasar los datos CSV para guardarlos en BD
      );

      // Registrar en sync_log
      const mensaje = csvType === 'marcaciones' 
        ? `CSV de marcaciones importado: ${file.name}`
        : `CSV de planilla importado: ${file.name}`;
        
      await logSync(
        sucursalSeleccionada.id,
        'planilla',
        'csv',
        'ok',
        mensaje,
        filePath,
        manifestPath
      );

      alert('¡Planilla guardada exitosamente en Supabase!');
      
      // Limpiar formulario
      setFile(null);
      setParseResult(null);
      setMarcacionesResult(null);
      setCsvType(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Error subiendo archivo:', error);
      alert(`Error guardando archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
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
                Necesitas seleccionar una sucursal desde el selector en el encabezado para importar planillas.
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Enhanced Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-bean mb-4 tracking-tight">Importar Planilla</h1>
        <p className="text-xl text-slate7g leading-relaxed">
          Subir CSV de planilla de empleados (formato INVU Panamá)
        </p>
      </div>

      {/* Sucursal Selector */}
      <div className="mb-8">
        <InlineSucursalSelector showLabel={true} />
      </div>

      {/* Card principal */}
      <div className="bg-white rounded-2xl shadow-lg border border-sand p-8 mb-8 transition-all duration-200 hover:shadow-xl">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-bean mb-4">
            Subir CSV de planilla (Panamá)
          </h2>
          <div className="space-y-2">
            <p className="text-slate7g text-lg">
              <strong className="text-bean">Formato empleados:</strong> empleado, codigo, monto (opcional: qty, centro)
            </p>
            <p className="text-slate7g text-lg">
              <strong className="text-bean">Formato marcaciones:</strong> empleado en primera columna, fechas en otras columnas
            </p>
          </div>
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
            accept=".csv"
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>

        {/* Enhanced Selector de período */}
        <div className="mt-8">
          <label className="block text-lg font-semibold text-bean mb-4">
            Período (mes/año)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate7g mb-2">Mes</label>
              <select
                value={period.mes}
                onChange={(e) => setPeriod(prev => ({ ...prev, mes: parseInt(e.target.value) }))}
                className="w-full px-4 py-3 border border-sand rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
              >
                {MESES.map((mes, idx) => (
                  <option key={idx} value={idx + 1}>{mes}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate7g mb-2">Año</label>
              <select
                value={period.año}
                onChange={(e) => setPeriod(prev => ({ ...prev, año: parseInt(e.target.value) }))}
                className="w-full px-4 py-3 border border-sand rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Resultado del parsing */}
      {parseResult && (
        <div className="bg-white rounded-2xl shadow-lg border border-sand p-8 mb-8 transition-all duration-200 hover:shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-bean">Vista previa del archivo</h3>
            <div className="flex items-center space-x-2">
              {csvType === 'marcaciones' ? (
                <div className="flex items-center space-x-2 px-4 py-2 bg-purple-100 text-purple-800 rounded-full font-medium">
                  <Clock className="h-5 w-5" />
                  <span>Marcaciones</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 px-4 py-2 bg-blue-100 text-blue-800 rounded-full font-medium">
                  <Users className="h-5 w-5" />
                  <span>Empleados</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Estado del mapeo */}
          <div className="mb-6">
            <div className="flex items-center space-x-6 text-slate7g">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-blue-600" />
                <span className="font-medium">{parseResult.rowCount} filas</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium">{parseResult.mappings.length} columnas mapeadas</span>
              </div>
              {parseResult.missing.length > 0 && (
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="font-medium">{parseResult.missing.length} columnas faltantes</span>
                </div>
              )}
            </div>
          </div>

          {/* Resumen específico para marcaciones */}
          {csvType === 'marcaciones' && marcacionesResult && (
            <div className="mb-6 p-6 bg-purple-50 border-l-4 border-purple-400 rounded-xl">
              <h4 className="text-lg font-bold text-purple-900 mb-4">Resumen de marcaciones:</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-800">{marcacionesResult.empleados.length}</div>
                  <div className="text-sm font-medium text-purple-700">Empleados</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-800">{marcacionesResult.totales.totalHorasGeneral}</div>
                  <div className="text-sm font-medium text-purple-700">Total horas</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-purple-800">
                    {marcacionesResult.periodo.inicio} → {marcacionesResult.periodo.fin}
                  </div>
                  <div className="text-sm font-medium text-purple-700">Período</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-800">{marcacionesResult.totales.promedioHorasPorDia}</div>
                  <div className="text-sm font-medium text-purple-700">Promedio h/día</div>
                </div>
              </div>
            </div>
          )}

          {/* Mapeo de columnas */}
          {parseResult.mappings.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-bold text-bean mb-4">Mapeo automático de columnas:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {parseResult.mappings.map((mapping: any, idx: number) => (
                  <div key={idx} className="flex items-center space-x-3 p-3 bg-off rounded-xl">
                    <span className="text-slate7g font-medium">"{mapping.source}"</span>
                    <span className="text-accent">→</span>
                    <span className="font-semibold text-bean">{mapping.target}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Columnas faltantes */}
          {parseResult.missing.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded-xl">
              <div className="flex items-center space-x-3 mb-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="font-semibold text-red-800">Columnas faltantes:</span>
              </div>
              <p className="text-red-700 font-medium">
                {parseResult.missing.join(', ')}
              </p>
            </div>
          )}

          {/* Errores */}
          {parseResult.errors.length > 0 && (
            <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-xl">
              <div className="flex items-center space-x-3 mb-3">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <span className="font-semibold text-yellow-800">Advertencias:</span>
              </div>
              <ul className="text-yellow-700 list-disc list-inside space-y-1">
                {parseResult.errors.slice(0, 5).map((error: string, idx: number) => (
                  <li key={idx} className="font-medium">{error}</li>
                ))}
                {parseResult.errors.length > 5 && (
                  <li className="font-medium">...y {parseResult.errors.length - 5} más</li>
                )}
              </ul>
            </div>
          )}

          {/* Vista previa de datos (primeras 5 filas) */}
          {parseResult.data.length > 0 && (
            <div className="mb-8">
              <h4 className="text-lg font-bold text-bean mb-4">Vista previa (primeras 5 filas):</h4>
              <div className="overflow-x-auto rounded-xl border border-sand">
                <table className="min-w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate7g text-white">
                      {parseResult.headers.slice(0, 6).map((header: string) => (
                        <th key={header} className="px-4 py-3 text-left font-semibold">
                          {header}
                        </th>
                      ))}
                      {parseResult.headers.length > 6 && (
                        <th className="px-4 py-3 text-left font-semibold">
                          ...
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.data.slice(0, 5).map((row: any, idx: number) => (
                      <tr key={idx} className={`transition-colors duration-150 hover:bg-accent/10 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-off/50'
                      }`}>
                        {parseResult.headers.slice(0, 6).map((header: string) => (
                          <td key={header} className="px-4 py-3 border-t border-sand">
                            {String(row[header] || '').slice(0, 50)}
                          </td>
                        ))}
                        {parseResult.headers.length > 6 && (
                          <td className="px-4 py-3 border-t border-sand text-slate7g">
                            ...
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parseResult.rowCount > 5 && (
                <p className="text-slate7g mt-4 text-center font-medium">
                  Mostrando las primeras 5 filas de {parseResult.rowCount} total
                </p>
              )}
            </div>
          )}

          {/* Botón de guardar */}
          <div className="flex justify-end">
            <button
              onClick={handleUpload}
              disabled={isUploading || (csvType === 'planilla' && parseResult.missing.length > 0)}
              className={`px-8 py-4 font-semibold rounded-2xl transition-all duration-200 transform focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                isUploading || (csvType === 'planilla' && parseResult.missing.length > 0)
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 hover:scale-105'
              }`}
            >
              {isUploading ? 'Guardando...' : 'Guardar en Supabase'}
            </button>
          </div>
        </div>
      )}
      </div>
    </Layout>
  );
};