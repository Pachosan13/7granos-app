import { useState, useRef, useMemo } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Clock, Users, CloudDownload, Loader2 } from 'lucide-react';
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
import { MonthYearPicker } from '../../lib/ui/MonthYearPicker';
import { flattenInvuMovements, FlattenedInvuMovement, InvuMovementType } from '../../services/invu';
import { fetchInvuMarcacionesByEpoch, InvuBranch } from '../../services/invu_marcaciones';
import { debugLog, yesterdayUTC5Range } from '../../utils/diagnostics';

interface PeriodSelection {
  mes: number;
  año: number;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface RemoteRange {
  desde: string;
  hasta: string;
}

const BRANCH_OPTIONS: Array<{ value: InvuBranch; label: string }> = [
  { value: 'sf', label: 'San Francisco' },
  { value: 'cangrejo', label: 'El Cangrejo' },
  { value: 'costa', label: 'Costa del Este' },
  { value: 'museo', label: 'Museo del Canal' },
  { value: 'central', label: 'Central' },
];

const getDefaultPeriod = (baseDate: Date = new Date()): PeriodSelection => ({
  mes: baseDate.getMonth() + 1,
  año: baseDate.getFullYear(),
});

const getDefaultRemotePeriod = (): PeriodSelection => {
  const { año, mes } = yesterdayUTC5Range();
  return { mes, año };
};

const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildRangeForPeriod = (period: PeriodSelection): RemoteRange => {
  const firstDay = new Date(period.año, period.mes - 1, 1);
  const lastDay = new Date(period.año, period.mes, 0);
  return {
    desde: formatDateInput(firstDay),
    hasta: formatDateInput(lastDay),
  };
};

const getDefaultRemoteRange = (): RemoteRange => {
  const { desde, hasta } = yesterdayUTC5Range();
  return { desde, hasta };
};

const parseDateParts = (value: string): { año: number; mes: number; dia: number } | null => {
  if (!value) {
    return null;
  }
  const [yearStr, monthStr, dayStr] = value.split('-');
  const año = Number.parseInt(yearStr ?? '', 10);
  const mes = Number.parseInt(monthStr ?? '', 10);
  const dia = Number.parseInt(dayStr ?? '', 10);

  if (!Number.isFinite(año) || !Number.isFinite(mes) || !Number.isFinite(dia)) {
    return null;
  }

  return { año, mes, dia };
};

// Helpers de rango (usar "ayer" por defecto para probar data real sin inputs adicionales)
const startOfDayLocal = (y: number, m: number, d: number) =>
  Math.floor(new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00-05:00`).getTime() / 1000);

const endOfDayLocal = (y: number, m: number, d: number) => startOfDayLocal(y, m, d) + 86399;

export const PlanillaPage = () => {
  const { sucursalSeleccionada } = useAuthOrg();
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [marcacionesResult, setMarcacionesResult] = useState<any>(null);
  const [csvType, setCsvType] = useState<'planilla' | 'marcaciones' | null>(null);
  const [period, setPeriod] = useState<PeriodSelection>(getDefaultPeriod);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [remotePeriod, setRemotePeriod] = useState<PeriodSelection>(getDefaultRemotePeriod);
  const [remoteRange, setRemoteRange] = useState<RemoteRange>(() => getDefaultRemoteRange());
  const [remoteBranch, setRemoteBranch] = useState<InvuBranch>('sf');
  const [remoteMovements, setRemoteMovements] = useState<FlattenedInvuMovement[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteFetchedRange, setRemoteFetchedRange] = useState<RemoteRange | null>(null);
  const [remoteLastUpdated, setRemoteLastUpdated] = useState<string | null>(null);
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);
  const remoteTypeTotals = useMemo(
    () =>
      remoteMovements.reduce(
        (acc, movement) => {
          acc[movement.tipo] = (acc[movement.tipo] ?? 0) + 1;
          return acc;
        },
        { clock_in: 0, clock_out: 0 } as Record<InvuMovementType, number>
      ),
    [remoteMovements]
  );
  const movementTypeLabels: Record<InvuMovementType, string> = {
    clock_in: 'Entrada',
    clock_out: 'Salida',
  };
  const remoteHasResults = remoteMovements.length > 0;
  const formatMovementDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  };

  const handleRemotePeriodChange = (value: PeriodSelection) => {
    setRemotePeriod(value);
    setRemoteRange(buildRangeForPeriod(value));
    setRemoteError(null);
  };

  const handleRemoteRangeChange = (field: keyof RemoteRange) => (value: string) => {
    setRemoteRange(prev => ({ ...prev, [field]: value }));
    setRemoteError(null);
  };

  const handleBranchChange = (value: InvuBranch) => {
    setRemoteBranch(value);
    setRemoteError(null);
  };

  async function handleLoadInvu() {
    const fallbackRange = getDefaultRemoteRange();
    const desde = remoteRange.desde || fallbackRange.desde;
    const hasta = remoteRange.hasta || fallbackRange.hasta;

    const inicio = parseDateParts(desde);
    const fin = parseDateParts(hasta);

    if (!inicio || !fin) {
      setRemoteError('Rango de fechas inválido.');
      return;
    }

    const fini = startOfDayLocal(inicio.año, inicio.mes, inicio.dia);
    const ffin = endOfDayLocal(fin.año, fin.mes, fin.dia);

    if (ffin < fini) {
      setRemoteError('La fecha final debe ser posterior o igual a la inicial.');
      return;
    }

    setRemoteLoading(true);
    setRemoteError(null);
    setRemoteNotice(null);

    try {
      const response = await fetchInvuMarcacionesByEpoch({
        branch: remoteBranch,
        fini,
        ffin,
      });

      if (response?.ok === false) {
        const statusNote = response.status ? `status ${response.status}` : '';
        const sampleNote = typeof response.sample === 'string'
          ? response.sample
          : response?.sample
            ? JSON.stringify(response.sample).slice(0, 200)
            : '';
        const invUrlNote = typeof response.inv_url === 'string' && response.inv_url
          ? `INVU: ${response.inv_url}`
          : '';
        const parts = [
          response.error ?? 'Marcaciones no disponibles.',
          statusNote,
          sampleNote,
          invUrlNote,
        ].filter(Boolean);
        throw new Error(parts.join(' · '));
      }

      const payload = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];

      const flattened = flattenInvuMovements(payload).sort(
        (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
      );

      setRemoteMovements(flattened);
      setRemoteFetchedRange({ desde, hasta });
      setRemoteLastUpdated(new Date().toISOString());
      setRemoteNotice(flattened.length === 0 ? 'Sin marcaciones en el rango.' : null);
    } catch (error) {
      debugLog('Error obteniendo marcaciones INVU:', error);
      setRemoteError(error instanceof Error ? error.message : 'Error desconocido al consultar INVU');
      setRemoteMovements([]);
      setRemoteFetchedRange(null);
      setRemoteNotice(null);
    } finally {
      setRemoteLoading(false);
    }
  }

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
      debugLog('Error parseando CSV:', error);
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
      debugLog('Error subiendo archivo:', error);
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

      {/* Consulta remota */}
      <div className="bg-white rounded-2xl shadow-lg border border-sand p-8 mb-8 transition-all duration-200 hover:shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-bean mb-1">Consulta remota (INVU)</h2>
            <p className="text-slate7g">
              Obtén marcaciones directamente desde INVU sin reemplazar la importación CSV existente.
            </p>
          </div>
          {remoteLastUpdated && (
            <div className="text-sm text-slate7g bg-off px-4 py-2 rounded-xl border border-sand/60">
              Última consulta: {new Date(remoteLastUpdated).toLocaleString()}
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-bean mb-3">Período de consulta</label>
              <MonthYearPicker
                value={remotePeriod}
                onChange={handleRemotePeriodChange}
                className="mb-4"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate7g mb-2 uppercase">Desde</label>
                  <input
                    type="date"
                    value={remoteRange.desde}
                    onChange={(e) => handleRemoteRangeChange('desde')(e.target.value)}
                    className="w-full px-4 py-3 border border-sand rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate7g mb-2 uppercase">Hasta</label>
                  <input
                    type="date"
                    value={remoteRange.hasta}
                    onChange={(e) => handleRemoteRangeChange('hasta')(e.target.value)}
                    className="w-full px-4 py-3 border border-sand rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-bean mb-3">Sucursal INVU</label>
              <select
                value={remoteBranch}
                onChange={(e) => handleBranchChange(e.target.value as InvuBranch)}
                className="w-full px-4 py-3 border border-sand rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-200"
              >
                {BRANCH_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate7g mt-2">
                Las consultas usan la función Edge oficial <code>invu-attendance</code> con tokens seguros en Supabase.
              </p>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex-1 rounded-2xl border border-dashed border-sand p-6 bg-off/40">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-bean uppercase tracking-wide">Resumen rápido</span>
                <Clock className="h-5 w-5 text-slate7g" />
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-3 bg-white rounded-xl border border-sand">
                  <div className="text-2xl font-bold text-bean">{remoteHasResults ? remoteMovements.length : '-'}</div>
                  <div className="text-xs uppercase tracking-wide text-slate7g">Movimientos</div>
                </div>
                <div className="p-3 bg-white rounded-xl border border-sand">
                  <div className="text-2xl font-bold text-bean">
                    {remoteHasResults ? remoteTypeTotals.clock_in : '-'}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate7g">Entradas</div>
                </div>
                <div className="p-3 bg-white rounded-xl border border-sand">
                  <div className="text-2xl font-bold text-bean">
                    {remoteHasResults ? remoteTypeTotals.clock_out : '-'}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate7g">Salidas</div>
                </div>
                <div className="p-3 bg-white rounded-xl border border-sand">
                  <div className="text-sm font-semibold text-bean">
                    {(remoteFetchedRange ?? remoteRange).desde} → {(remoteFetchedRange ?? remoteRange).hasta}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate7g">Rango</div>
                </div>
              </div>
              <div className="mt-4 text-xs text-slate7g text-center">
                <span className="font-semibold text-bean">Sucursal</span>{' '}
                {BRANCH_OPTIONS.find(option => option.value === remoteBranch)?.label || remoteBranch.toUpperCase()}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {remoteError && (
                <div className="flex items-start space-x-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <span>{remoteError}</span>
                </div>
              )}
              <div className="flex-1 sm:flex sm:justify-end">
                <button
                  onClick={handleLoadInvu}
                  disabled={remoteLoading}
                  className={`w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3 font-semibold rounded-2xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                    remoteLoading
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105 focus:ring-purple-500'
                  }`}
                >
                  {remoteLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CloudDownload className="h-5 w-5" />
                  )}
                  <span>{remoteLoading ? 'Consultando...' : 'Cargar marcaciones INVU'}</span>
                </button>
              </div>
            </div>

            {remoteHasResults ? (
              <div className="mt-6">
                <div className="overflow-x-auto rounded-2xl border border-sand">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate7g text-white">
                        <th className="px-4 py-3 text-left font-semibold">Fecha y hora</th>
                        <th className="px-4 py-3 text-left font-semibold">Empleado</th>
                        <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                        <th className="px-4 py-3 text-left font-semibold">Movimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remoteMovements.map((movement) => (
                        <tr key={`${movement.id_movimiento}-${movement.fecha}-${movement.id_empleado}`}>
                          <td className="px-4 py-3 border-t border-sand">
                            {formatMovementDate(movement.fecha)}
                          </td>
                          <td className="px-4 py-3 border-t border-sand font-medium text-bean">
                            {movement.id_empleado}
                          </td>
                          <td className="px-4 py-3 border-t border-sand">
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                                movement.tipo === 'clock_in'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}
                            >
                              {movementTypeLabels[movement.tipo]}
                            </span>
                          </td>
                          <td className="px-4 py-3 border-t border-sand text-slate7g">
                            {movement.id_movimiento}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate7g mt-3">
                  Vista previa de movimientos remotos. Aún no se guardan en Supabase.
                </p>
                {/* TODO(Attendance): Guardar movimientos en Supabase reutilizando saveUpload o un servicio dedicado.
                    Shape esperado: { id_movimiento, id_empleado, fecha, tipo } */}
              </div>
            ) : (
              !remoteLoading &&
              !remoteError && (
                <p className="mt-6 text-sm text-slate7g">
                  {remoteNotice ?? 'No hay movimientos consultados todavía. Define un rango y ejecuta la consulta para ver resultados.'}
                </p>
              )
            )}
          </div>
        </div>
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
