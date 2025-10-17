import { useState, useRef } from 'react';
import {
  Upload, FileText, AlertCircle, CheckCircle, Calendar,
  TrendingUp, ShoppingCart, RefreshCw, Clock
} from 'lucide-react';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { parseCSV } from '../../lib/csv/parse';
import { saveUpload, logSync, updateSyncCursor } from '../../lib/storage/saveUpload';
import { fetchVentas, fetchCompras } from '../../services/invu';
import { InlineSucursalSelector } from '../../components/InlineSucursalSelector';
import { Layout } from '../../components/Layout';

type TabType = 'ventas' | 'compras';

interface DateRange {
  desde: string;
  hasta: string;
}

export const ContabilidadPage = () => {
  const { sucursalSeleccionada } = useAuthOrg();
  const [activeTab, setActiveTab] = useState<TabType>('ventas');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    desde: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    hasta: new Date().toISOString().split('T')[0]
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
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

    try {
      const result = await parseCSV(selectedFile, activeTab);
      setParseResult(result);
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

  const handleUploadCSV = async () => {
    if (!file || !parseResult || !sucursalSeleccionada || parseResult.missing.length > 0) {
      return;
    }

    setIsUploading(true);
    
    try {
      // Calcular totales según el tipo
      const totals: Record<string, number> = {};
      
      if (activeTab === 'ventas') {
        let totalVentas = 0;
        let totalPropinas = 0;
        let totalItbms = 0;
        let totalTransacciones = 0;

        parseResult.data.forEach((row: any) => {
          totalVentas += parseFloat(row.total) || 0;
          totalPropinas += parseFloat(row.propinas) || 0;
          totalItbms += parseFloat(row.itbms) || 0;
          totalTransacciones += parseInt(row.num_transacciones) || 0;
        });

        totals.total_ventas = Math.round(totalVentas * 100) / 100;
        totals.total_propinas = Math.round(totalPropinas * 100) / 100;
        totals.total_itbms = Math.round(totalItbms * 100) / 100;
        totals.total_transacciones = totalTransacciones;
      } else {
        // Compras
        let totalCompras = 0;
        let totalSubtotal = 0;
        let totalItbms = 0;
        const proveedores = new Set();

        parseResult.data.forEach((row: any) => {
          totalCompras += parseFloat(row.total) || 0;
          totalSubtotal += parseFloat(row.subtotal) || 0;
          totalItbms += parseFloat(row.itbms) || 0;
          if (row.proveedor) proveedores.add(row.proveedor);
        });

        totals.total_compras = Math.round(totalCompras * 100) / 100;
        totals.total_subtotal = Math.round(totalSubtotal * 100) / 100;
        totals.total_itbms = Math.round(totalItbms * 100) / 100;
        totals.total_proveedores = proveedores.size;
      }

      // Subir archivo y crear manifiesto
      const { filePath, manifestPath } = await saveUpload(
        file,
        sucursalSeleccionada.id,
        activeTab,
        {
          rows: parseResult.rowCount,
          columns: parseResult.headers,
          totals
        },
        parseResult.data // ← AGREGAR ESTO: pasar los datos CSV para guardarlos en BD
      );

      // Registrar en sync_log
      await logSync(
        sucursalSeleccionada.id,
        activeTab,
        'csv',
        'ok',
        `CSV ${activeTab} importado: ${file.name}`,
        filePath,
        manifestPath
      );

      alert(`¡${activeTab === 'ventas' ? 'Ventas' : 'Compras'} guardadas exitosamente en Supabase!`);

      // Auto-post to GL if data exists
      try {
        const { data: postResult, error: postError } = await supabase.rpc(
          activeTab === 'ventas' ? 'api_post_sales_to_gl' : 'api_post_purchases_to_gl',
          {
            desde: dateRange.desde,
            hasta: dateRange.hasta,
            p_sucursal_id: sucursalSeleccionada.id
          }
        );

        if (postError) {
          console.warn('Error posting to GL:', postError);
        } else if (postResult && postResult.length > 0) {
          const journalCount = postResult.length;
          const confirmed = confirm(
            `✅ Datos importados exitosamente.\n\n` +
            `Se crearon ${journalCount} póliza${journalCount !== 1 ? 's' : ''} contable${journalCount !== 1 ? 's' : ''}.\n\n` +
            `¿Deseas ver el diario contable?`
          );

          if (confirmed) {
            window.location.href = `/gl?tab=diario&desde=${dateRange.desde}&hasta=${dateRange.hasta}`;
            return;
          }
        }
      } catch (postErr) {
        console.warn('Could not auto-post to GL:', postErr);
      }

      // Limpiar formulario
      setFile(null);
      setParseResult(null);
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

  const handleSyncAPI = async () => {
    if (!sucursalSeleccionada) return;

    setIsSyncing(true);
    
    try {
      const desde = new Date(dateRange.desde);
      const hasta = new Date(dateRange.hasta);
      
      let data;
      if (activeTab === 'ventas') {
        data = await fetchVentas(sucursalSeleccionada.id, desde, hasta);
      } else {
        data = await fetchCompras(sucursalSeleccionada.id, desde, hasta);
      }

      // Registrar en sync_log
      await logSync(
        sucursalSeleccionada.id,
        activeTab,
        'api',
        'ok',
        `Sync INVU ${activeTab}: ${data.length} registros obtenidos`
      );

      // Actualizar cursor
      await updateSyncCursor(sucursalSeleccionada.id, activeTab);

      alert(`¡Sincronización completada! Se obtuvieron ${data.length} registros de ${activeTab}.`);

      // Auto-post to GL after successful API sync
      if (activeTab === 'ventas') {
        try {
          const { data: postResult, error: postError } = await supabase.rpc('api_post_sales_to_gl', {
            desde: dateRange.desde,
            hasta: dateRange.hasta,
            p_sucursal_id: sucursalSeleccionada.id
          });

          if (postError) {
            console.warn('Error posting to GL:', postError);
          } else if (postResult && postResult.length > 0) {
            const journalCount = postResult.length;
            const confirmed = confirm(
              `✅ Datos sincronizados y posteados exitosamente.\n\n` +
              `Se crearon ${journalCount} póliza${journalCount !== 1 ? 's' : ''} contable${journalCount !== 1 ? 's' : ''}.\n\n` +
              `¿Deseas ver el diario contable?`
            );

            if (confirmed) {
              window.location.href = `/gl?tab=diario&desde=${dateRange.desde}&hasta=${dateRange.hasta}`;
            }
          }
        } catch (postErr) {
          console.warn('Could not auto-post to GL:', postErr);
        }
      }

    } catch (error) {
      console.error('Error en sincronización:', error);
      
      // Registrar error en sync_log
      await logSync(
        sucursalSeleccionada.id,
        activeTab,
        'api',
        'error',
        `Error sync INVU: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );

      alert(`Error en sincronización: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setIsSyncing(false);
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
                Necesitas seleccionar una sucursal desde el selector en el encabezado para importar datos contables.
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Enhanced Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-bean mb-4 tracking-tight">Importar Contabilidad</h1>
        <p className="text-xl text-slate7g leading-relaxed">
          Importar datos contables desde CSV o sincronizar con INVU API
        </p>
      </div>

      {/* Sucursal Selector */}
      <div className="mb-8">
        <InlineSucursalSelector showLabel={true} />
      </div>

      {/* Enhanced Tabs */}
      <div className="border-b border-sand mb-8">
        <nav className="-mb-px flex space-x-1">
          <button
            onClick={() => {
              setActiveTab('ventas');
              setFile(null);
              setParseResult(null);
            }}
            className={`py-4 px-6 border-b-3 font-semibold text-base transition-all duration-200 ${
              activeTab === 'ventas'
                ? 'border-green-500 text-green-600 bg-green-50/50'
                : 'border-transparent text-slate7g hover:text-bean hover:border-sand hover:bg-off/50'
            }`}
          >
            <div className="flex items-center space-x-3">
              <TrendingUp className="h-5 w-5" />
              <span>Ventas</span>
            </div>
          </button>
          <button
            onClick={() => {
              setActiveTab('compras');
              setFile(null);
              setParseResult(null);
            }}
            className={`py-4 px-6 border-b-3 font-semibold text-base transition-all duration-200 ${
              activeTab === 'compras'
                ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate7g hover:text-bean hover:border-sand hover:bg-off/50'
            }`}
          >
            <div className="flex items-center space-x-3">
              <ShoppingCart className="h-5 w-5" />
              <span>Compras</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Contenido del tab activo */}
      <div className="space-y-8">
        {/* Card de CSV Import */}
        <div className="bg-white rounded-2xl shadow-lg border border-sand p-8 transition-all duration-200 hover:shadow-xl">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-bean mb-3">
              Subir CSV de {activeTab} {activeTab === 'ventas' ? '(respaldo de INVU)' : ''}
            </h2>
            <p className="text-slate7g text-lg">
              {activeTab === 'ventas' 
                ? 'Columnas requeridas: fecha, sucursal, total, propinas, itbms, num_transacciones'
                : 'Columnas requeridas: proveedor, factura, fecha, subtotal, itbms, total'
              }
            </p>
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
              Arrastra tu archivo CSV de {activeTab} aquí
            </p>
            <p className="text-lg text-slate7g mb-8">
              O haz clic para seleccionar
            </p>

            <button
              onClick={() => sucursalSeleccionada && fileInputRef.current?.click()}
              disabled={!sucursalSeleccionada}
              className={`px-8 py-4 font-semibold rounded-2xl transition-all duration-200 transform focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                !sucursalSeleccionada
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : activeTab === 'ventas'
                    ? 'bg-green-600 text-white hover:bg-green-700 hover:scale-105 focus:ring-green-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 focus:ring-blue-500'
              }`}
            >
              Seleccionar archivo CSV
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* Vista previa del CSV */}
          {parseResult && (
            <div className="mt-8 p-6 bg-off rounded-2xl border border-sand">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-xl font-bold text-bean">Vista previa del archivo</h4>
                <div className="flex items-center space-x-6 text-slate7g">
                  <span>{parseResult.rowCount} filas</span>
                  <span>{parseResult.mappings.length} columnas mapeadas</span>
                </div>
              </div>

              {parseResult.missing.length > 0 && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <span className="font-semibold text-red-800">Columnas faltantes:</span>
                    <span className="text-red-700 font-medium">{parseResult.missing.join(', ')}</span>
                  </div>
                </div>
              )}

              {parseResult.data.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-sand">
                  <table className="min-w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate7g text-white">
                        {parseResult.headers.slice(0, 6).map((header: string) => (
                          <th key={header} className="px-4 py-3 text-left font-semibold">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.data.slice(0, 3).map((row: any, idx: number) => (
                        <tr key={idx} className={`transition-colors duration-150 hover:bg-accent/10 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-off/50'
                        }`}>
                          {parseResult.headers.slice(0, 6).map((header: string) => (
                            <td key={header} className="px-4 py-3 border-t border-sand">
                              {String(row[header] || '').slice(0, 30)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end mt-8">
                <button
                  onClick={handleUploadCSV}
                  disabled={isUploading || parseResult.missing.length > 0}
                  className={`px-8 py-4 font-semibold rounded-2xl transition-all duration-200 transform focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                    isUploading || parseResult.missing.length > 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : `${activeTab === 'ventas' ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500 hover:scale-105' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 hover:scale-105'} text-white`
                  }`}
                >
                  {isUploading ? 'Guardando...' : 'Guardar en Supabase'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Card de API Sync */}
        <div className="bg-white rounded-2xl shadow-lg border border-sand p-8 transition-all duration-200 hover:shadow-xl">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-bean mb-3">
              Sincronizar con INVU (API)
            </h2>
            <div className="flex items-center space-x-3 text-amber-700 bg-amber-50 px-4 py-3 rounded-xl border border-amber-200">
              <Clock className="h-5 w-5" />
              <span>Modo prueba — usando datos simulados</span>
            </div>
          </div>

          {/* Selector de rango de fechas */}
          <div className="mb-8">
            <label className="block text-lg font-semibold text-bean mb-4">
              Rango de fechas para sincronizar
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate7g mb-2">Desde</label>
                <input
                  type="date"
                  value={dateRange.desde}
                  onChange={(e) => setDateRange(prev => ({ ...prev, desde: e.target.value }))}
                  className="w-full px-4 py-3 border border-sand rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate7g mb-2">Hasta</label>
                <input
                  type="date"
                  value={dateRange.hasta}
                  onChange={(e) => setDateRange(prev => ({ ...prev, hasta: e.target.value }))}
                  className="w-full px-4 py-3 border border-sand rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSyncAPI}
            disabled={isSyncing || !sucursalSeleccionada}
            className={`flex items-center space-x-3 px-8 py-4 font-semibold rounded-2xl transition-all duration-200 transform focus:outline-none focus:ring-4 focus:ring-offset-2 ${
              isSyncing || !sucursalSeleccionada
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : `${activeTab === 'ventas' ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500 hover:scale-105' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 hover:scale-105'} text-white`
            }`}
          >
            <RefreshCw className={`h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {isSyncing
                ? `Sincronizando ${activeTab}...`
                : `Sincronizar ${activeTab} con INVU`
              }
            </span>
          </button>
        </div>
      </div>
      </div>
    </Layout>
  );
};