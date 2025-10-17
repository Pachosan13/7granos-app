import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calculator, AlertCircle, Upload, Users, DollarSign,
  FileText, Settings, Play, CheckCircle, Clock, Trash2, Plus,
  Download, FileImage, Cog, FileSpreadsheet, Building2
} from 'lucide-react';
import { Layout } from '../../components/Layout';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { supabase } from '../../lib/supabase';
import { calculatePayroll } from '../../payroll/engine';
import { buildProforma, saveProformaToStorage } from '../../payroll/proforma';
import { getCSVsWithManifests, downloadAndParseCSV } from '../../lib/csv/fromStorage';
import { formatCurrencyUSD } from '../../lib/format';

interface Periodo {
  id: string;
  periodo_mes: number;
  periodo_ano: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: 'borrador' | 'calculado' | 'aprobado' | 'pagado';
}

interface Empleado {
  id: string;
  nombre: string;
  cedula: string;
  cargo: string;
  salario_base: number;
}

interface Entry {
  id: string;
  empleado_id: string;
  code: string;
  monto: number;
  qty: number;
  centro: string;
  empleado?: { nombre: string };
}

interface Deduccion {
  id: string;
  empleado_id: string;
  tipo: string;
  monto_total: number;
  saldo: number;
  cuota_periodo: number;
  prioridad: number;
  activo: boolean;
  empleado?: { nombre: string };
}

interface Resultado {
  id: string;
  empleado_id: string;
  bruto: number;
  deducciones_legales: number;
  deducciones_contractuales: number;
  neto: number;
  detalle: Record<string, number>;
  empleado?: { nombre: string };
}

type TabType = 'entradas' | 'deducciones' | 'resultados' | 'reporte';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const TIPOS_DEDUCCION = {
  LOAN: 'Préstamo',
  ADVANCE: 'Adelanto',
  GARNISHMENT: 'Embargo',
  OTHER: 'Otro'
};

export const Calcular = () => {
  const { sucursalSeleccionada } = useAuthOrg();
  const [searchParams] = useSearchParams();
  const periodoId = searchParams.get('periodo');
  
  const [activeTab, setActiveTab] = useState<TabType>('entradas');
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [deducciones, setDeducciones] = useState<Deduccion[]>([]);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');
  const [csvFiles, setCsvFiles] = useState<any[]>([]);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [showDeduccionForm, setShowDeduccionForm] = useState(false);
  const [newDeduccion, setNewDeduccion] = useState({
    empleado_id: '',
    tipo: 'LOAN' as keyof typeof TIPOS_DEDUCCION,
    monto_total: 0,
    cuota_periodo: 0,
    prioridad: 1,
    inicio: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (sucursalSeleccionada && periodoId) {
      loadData();
    }
  }, [sucursalSeleccionada, periodoId]);

  const loadData = async () => {
    if (!sucursalSeleccionada || !periodoId) return;

    try {
      setLoading(true);
      setError('');

      // Cargar período
      const { data: periodoData, error: periodoError } = await supabase
        .from('hr_periodo')
        .select('*')
        .eq('id', periodoId)
        .single();

      if (periodoError) throw periodoError;
      setPeriodo(periodoData);

      // Cargar empleados
      const { data: empleadosData, error: empleadosError } = await supabase
        .from('hr_empleado')
        .select('*')
        .eq('sucursal_id', sucursalSeleccionada.id)
        .eq('activo', true)
        .order('nombre');

      if (empleadosError) throw empleadosError;
      setEmpleados(empleadosData || []);

      // Cargar entradas
      const { data: entriesData, error: entriesError } = await supabase
        .from('hr_entry')
        .select(`
          *,
          hr_empleado!inner(nombre)
        `)
        .eq('periodo_id', periodoId)
        .order('created_at');

      if (entriesError) throw entriesError;
      setEntries(entriesData || []);

      // Cargar deducciones
      const { data: deduccionesData, error: deduccionesError } = await supabase
        .from('hr_deduccion')
        .select(`
          *,
          hr_empleado!inner(nombre)
        `)
        .eq('sucursal_id', sucursalSeleccionada.id)
        .order('prioridad');

      if (deduccionesError) throw deduccionesError;
      setDeducciones(deduccionesData || []);

      // Cargar resultados
      const { data: resultadosData, error: resultadosError } = await supabase
        .from('hr_resultado')
        .select(`
          *,
          hr_empleado!inner(nombre)
        `)
        .eq('periodo_id', periodoId)
        .order('created_at');

      if (resultadosError) throw resultadosError;
      setResultados(resultadosData || []);

      // Cargar archivos CSV disponibles
      const files = await getCSVsWithManifests(sucursalSeleccionada.id);
      setCsvFiles(files);

    } catch (error) {
      console.error('Error cargando datos:', error);
      setError('Error cargando datos del período');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculatePayroll = async () => {
    if (!periodoId || !sucursalSeleccionada) return;

    try {
      setCalculating(true);
      setError('');

      const result = await calculatePayroll({
        periodoId,
        sucursalId: sucursalSeleccionada.id
      });

      if (result.success) {
        await loadData(); // Recargar datos
        setActiveTab('resultados'); // Cambiar a tab de resultados
        alert(result.message);
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error('Error calculando planilla:', error);
      setError('Error calculando planilla');
    } finally {
      setCalculating(false);
    }
  };

  const handleLoadCSV = async (csvPath: string) => {
    if (!periodoId || !sucursalSeleccionada) return;

    try {
      setError('');
      const csvData = await downloadAndParseCSV(csvPath);
      
      if (!csvData) {
        setError('Error cargando archivo CSV');
        return;
      }

      // Procesar datos del CSV y crear entradas
      const newEntries = [];
      const empleadosMap = new Map(empleados.map(e => [e.nombre.toLowerCase(), e.id]));

      for (const row of csvData.data) {
        const empleadoNombre = String(row.empleado || '').toLowerCase().trim();
        const codigo = String(row.codigo || row.code || '').trim();
        const monto = parseFloat(row.monto || row.amount || '0');

        if (empleadoNombre && codigo && monto > 0) {
          let empleadoId = empleadosMap.get(empleadoNombre);

          // Si no existe el empleado, crearlo
          if (!empleadoId) {
            const { data: newEmpleado, error } = await supabase
              .from('hr_empleado')
              .insert({
                sucursal_id: sucursalSeleccionada.id,
                nombre: empleadoNombre,
                cedula: String(row.cedula || ''),
                cargo: String(row.cargo || 'Empleado'),
                salario_base: monto,
                activo: true
              })
              .select()
              .single();

            if (error) {
              console.error('Error creando empleado:', error);
              continue;
            }

            empleadoId = newEmpleado.id;
            empleadosMap.set(empleadoNombre, empleadoId);
          }

          newEntries.push({
            sucursal_id: sucursalSeleccionada.id,
            periodo_id: periodoId,
            empleado_id: empleadoId,
            code: codigo,
            qty: parseFloat(row.qty || '1'),
            monto,
            centro: String(row.centro || '')
          });
        }
      }

      if (newEntries.length > 0) {
        const { error } = await supabase
          .from('hr_entry')
          .insert(newEntries);

        if (error) throw error;

        await loadData();
        setShowCSVModal(false);
        alert(`Se cargaron ${newEntries.length} entradas desde el CSV`);
      } else {
        setError('No se encontraron datos válidos en el CSV');
      }

    } catch (error) {
      console.error('Error cargando CSV:', error);
      setError('Error procesando archivo CSV');
    }
  };

  const handleCreateDeduccion = async () => {
    if (!sucursalSeleccionada) return;

    try {
      const { error } = await supabase
        .from('hr_deduccion')
        .insert({
          sucursal_id: sucursalSeleccionada.id,
          empleado_id: newDeduccion.empleado_id,
          tipo: newDeduccion.tipo,
          monto_total: newDeduccion.monto_total,
          saldo: newDeduccion.monto_total,
          cuota_periodo: newDeduccion.cuota_periodo,
          prioridad: newDeduccion.prioridad,
          inicio: newDeduccion.inicio,
          activo: true
        });

      if (error) throw error;

      await loadData();
      setShowDeduccionForm(false);
      setNewDeduccion({
        empleado_id: '',
        tipo: 'LOAN',
        monto_total: 0,
        cuota_periodo: 0,
        prioridad: 1,
        inicio: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      console.error('Error creando deducción:', error);
      setError('Error creando deducción');
    }
  };

  const handleExportCSV = () => {
    alert('Exportar CSV - Funcionalidad pendiente');
  };

  const handleExportPDF = () => {
    alert('Exportar PDF - Funcionalidad pendiente');
  };

  const handleGenerateProforma = async () => {
    if (!periodoId || !sucursalSeleccionada) return;
    try {
      const proforma = await buildProforma(periodoId, sucursalSeleccionada.id);
      await saveProformaToStorage(proforma, sucursalSeleccionada.id, periodoId);
      alert('Proforma generada exitosamente');
    } catch (error) {
      console.error('Error generando proforma:', error);
      setError('Error generando proforma');
    }
  };

  const totales = resultados.length > 0 ? {
    total_bruto: resultados.reduce((sum, r) => sum + r.bruto, 0),
    total_legales_emp: resultados.reduce((sum, r) => sum + r.deducciones_legales, 0),
    total_contractuales: resultados.reduce((sum, r) => sum + r.deducciones_contractuales, 0),
    total_neto: resultados.reduce((sum, r) => sum + r.neto, 0),
    total_css_patronal: resultados.reduce((sum, r) => sum + ((r as any).css_patronal || 0), 0),
    total_edu_patronal: resultados.reduce((sum, r) => sum + ((r as any).edu_patronal || 0), 0),
    total_costo_laboral: resultados.reduce((sum, r) => sum + ((r as any).costo_laboral_total || 0), 0)
  } : null;

  if (!sucursalSeleccionada || !periodoId) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-md mx-auto">
            <div className="bg-accent/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="h-12 w-12 text-accent" />
            </div>
            <h3 className="text-2xl font-bold text-bean mb-3">Período no encontrado</h3>
            <p className="text-slate7g text-lg leading-relaxed">
              Selecciona un período válido para calcular la planilla.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"></div>
            <p className="text-slate-700">Cargando datos del período...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8 max-w-6xl mx-auto">
        {/* Branch Indicator Banner */}
        <div className="mb-8 bg-gradient-to-r from-accent to-accent/80 text-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-white/20 p-3 rounded-xl">
                <Building2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-sm font-medium opacity-90">Calculando planilla para</h3>
                <p className="text-2xl font-bold">{sucursalSeleccionada.nombre}</p>
              </div>
            </div>
            {periodo && (
              <div className="text-right">
                <p className="text-sm opacity-90">Período</p>
                <p className="text-xl font-bold">
                  {MESES[periodo.periodo_mes - 1]} {periodo.periodo_ano}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-bold text-bean mb-4 tracking-tight">
              Calcular Planilla
            </h1>
            {periodo && (
              <p className="text-xl text-slate7g leading-relaxed">
                {MESES[periodo.periodo_mes - 1]} {periodo.periodo_ano}
              </p>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <div className={`px-4 py-2 rounded-full text-sm font-medium ${
              periodo?.estado === 'borrador' ? 'bg-gray-100 text-gray-800' :
              periodo?.estado === 'calculado' ? 'bg-blue-100 text-blue-800' :
              periodo?.estado === 'aprobado' ? 'bg-green-100 text-green-800' :
              'bg-purple-100 text-purple-800'
            }`}>
              {periodo?.estado === 'borrador' ? 'Borrador' :
               periodo?.estado === 'calculado' ? 'Calculado' :
               periodo?.estado === 'aprobado' ? 'Aprobado' : 'Pagado'}
            </div>

            <button
              onClick={handleCalculatePayroll}
              disabled={calculating || entries.length === 0}
              className="flex items-center space-x-3 px-6 py-3 bg-green-600 text-white font-semibold rounded-2xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-offset-2 shadow-lg"
            >
              {calculating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Calculando...</span>
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  <span>Calcular Período</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border-l-4 border-red-400 rounded-xl">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-sand mb-8">
          <nav className="-mb-px flex space-x-1">
            {[
              { id: 'entradas', label: 'Entradas', icon: FileText, count: entries.length },
              { id: 'deducciones', label: 'Deducciones', icon: Settings, count: deducciones.filter(d => d.activo).length },
              { id: 'resultados', label: 'Resultados', icon: Calculator, count: resultados.length }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`py-4 px-6 border-b-3 font-semibold text-base transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'border-accent text-accent bg-accent/5'
                    : 'border-transparent text-slate7g hover:text-bean hover:border-sand hover:bg-off/50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <tab.icon className="h-5 w-5" />
                  <span>{tab.label}</span>
                  <span className="bg-slate7g/20 text-slate7g px-2 py-1 rounded-full text-xs font-medium">
                    {tab.count}
                  </span>
                </div>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="space-y-8">
          {/* Entradas Tab */}
          {activeTab === 'entradas' && (
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-bean">Entradas de Planilla</h3>
                <button
                  onClick={() => setShowCSVModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all duration-200"
                >
                  <Upload className="h-4 w-4" />
                  <span>Cargar desde CSV</span>
                </button>
              </div>

              {entries.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 text-slate7g mx-auto mb-6" />
                  <h4 className="text-xl font-bold text-bean mb-3">No hay entradas</h4>
                  <p className="text-slate7g mb-6">
                    Carga entradas desde un archivo CSV para comenzar.
                  </p>
                  <button
                    onClick={() => setShowCSVModal(true)}
                    className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-2xl hover:bg-blue-700 transition-all duration-200"
                  >
                    Cargar desde CSV
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-sand">
                  <table className="min-w-full">
                    <thead className="bg-slate7g text-white">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Empleado</th>
                        <th className="px-4 py-3 text-left font-semibold">Código</th>
                        <th className="px-4 py-3 text-right font-semibold">Cantidad</th>
                        <th className="px-4 py-3 text-right font-semibold">Monto</th>
                        <th className="px-4 py-3 text-left font-semibold">Centro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, index) => (
                        <tr 
                          key={entry.id}
                          className={`transition-colors duration-150 hover:bg-accent/5 ${
                            index % 2 === 0 ? 'bg-white' : 'bg-off/30'
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-bean">
                            {entry.hr_empleado?.nombre}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono bg-off px-2 py-1 rounded text-sm">
                              {entry.code}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate7g">
                            {entry.qty}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-bean">
                            {formatCurrencyUSD(entry.monto)}
                          </td>
                          <td className="px-4 py-3 text-slate7g">
                            {entry.centro || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Deducciones Tab */}
          {activeTab === 'deducciones' && (
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-bean">Deducciones Contractuales</h3>
                <button
                  onClick={() => setShowDeduccionForm(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all duration-200"
                >
                  <Plus className="h-4 w-4" />
                  <span>Nueva Deducción</span>
                </button>
              </div>

              {deducciones.length === 0 ? (
                <div className="text-center py-12">
                  <Settings className="h-16 w-16 text-slate7g mx-auto mb-6" />
                  <h4 className="text-xl font-bold text-bean mb-3">No hay deducciones</h4>
                  <p className="text-slate7g mb-6">
                    Agrega deducciones contractuales como préstamos o adelantos.
                  </p>
                  <button
                    onClick={() => setShowDeduccionForm(true)}
                    className="px-6 py-3 bg-red-600 text-white font-semibold rounded-2xl hover:bg-red-700 transition-all duration-200"
                  >
                    Nueva Deducción
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-sand">
                  <table className="min-w-full">
                    <thead className="bg-slate7g text-white">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Empleado</th>
                        <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                        <th className="px-4 py-3 text-right font-semibold">Total</th>
                        <th className="px-4 py-3 text-right font-semibold">Saldo</th>
                        <th className="px-4 py-3 text-right font-semibold">Cuota</th>
                        <th className="px-4 py-3 text-center font-semibold">Prioridad</th>
                        <th className="px-4 py-3 text-center font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deducciones.map((deduccion, index) => (
                        <tr 
                          key={deduccion.id}
                          className={`transition-colors duration-150 hover:bg-accent/5 ${
                            index % 2 === 0 ? 'bg-white' : 'bg-off/30'
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-bean">
                            {deduccion.hr_empleado?.nombre}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                              {TIPOS_DEDUCCION[deduccion.tipo as keyof typeof TIPOS_DEDUCCION]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-bean">
                            {formatCurrencyUSD(deduccion.monto_total)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate7g">
                            {formatCurrencyUSD(deduccion.saldo)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-bean">
                            {formatCurrencyUSD(deduccion.cuota_periodo)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                              {deduccion.prioridad}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              deduccion.activo && deduccion.saldo > 0
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {deduccion.activo && deduccion.saldo > 0 ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Resultados Tab */}
          {activeTab === 'resultados' && (
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h3 className="text-2xl font-bold text-bean mb-6">Resultados de Planilla</h3>

              {resultados.length === 0 ? (
                <div className="text-center py-12">
                  <Calculator className="h-16 w-16 text-slate7g mx-auto mb-6" />
                  <h4 className="text-xl font-bold text-bean mb-3">No hay resultados</h4>
                  <p className="text-slate7g mb-6">
                    Ejecuta el cálculo de planilla para ver los resultados.
                  </p>
                  <button
                    onClick={handleCalculatePayroll}
                    disabled={calculating || entries.length === 0}
                    className="px-6 py-3 bg-green-600 text-white font-semibold rounded-2xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    {calculating ? 'Calculando...' : 'Calcular Período'}
                  </button>
                </div>
              ) : (
                <>
                  {/* Resumen */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-green-50 p-6 rounded-2xl border border-green-200">
                      <div className="flex items-center justify-between mb-2">
                        <DollarSign className="h-8 w-8 text-green-600" />
                        <div className="text-3xl font-bold text-green-900">
                          {formatCurrencyUSD(resultados.reduce((sum, r) => sum + r.bruto, 0))}
                        </div>
                      </div>
                      <p className="text-green-700 font-medium">Total Bruto</p>
                    </div>
                    
                    <div className="bg-red-50 p-6 rounded-2xl border border-red-200">
                      <div className="flex items-center justify-between mb-2">
                        <Settings className="h-8 w-8 text-red-600" />
                        <div className="text-3xl font-bold text-red-900">
                          {formatCurrencyUSD(resultados.reduce((sum, r) => sum + r.deducciones_contractuales, 0))}
                        </div>
                      </div>
                      <p className="text-red-700 font-medium">Total Deducciones</p>
                    </div>
                    
                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-200">
                      <div className="flex items-center justify-between mb-2">
                        <CheckCircle className="h-8 w-8 text-blue-600" />
                        <div className="text-3xl font-bold text-blue-900">
                          {formatCurrencyUSD(resultados.reduce((sum, r) => sum + r.neto, 0))}
                        </div>
                      </div>
                      <p className="text-blue-700 font-medium">Total Neto</p>
                    </div>
                  </div>

                  {/* Tabla de resultados */}
                  <div className="overflow-x-auto rounded-xl border border-sand">
                    <table className="min-w-full">
                      <thead className="bg-slate7g text-white">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Empleado</th>
                          <th className="px-4 py-3 text-right font-semibold">Bruto</th>
                          <th className="px-4 py-3 text-right font-semibold">Ded. Legales</th>
                          <th className="px-4 py-3 text-right font-semibold">Ded. Contractuales</th>
                          <th className="px-4 py-3 text-right font-semibold">Neto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultados.map((resultado, index) => (
                          <tr 
                            key={resultado.id}
                            className={`transition-colors duration-150 hover:bg-accent/5 ${
                              index % 2 === 0 ? 'bg-white' : 'bg-off/30'
                            }`}
                          >
                            <td className="px-4 py-3 font-medium text-bean">
                              {resultado.hr_empleado?.nombre}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-green-700">
                              {formatCurrencyUSD(resultado.bruto)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate7g">
                              {formatCurrencyUSD(resultado.deducciones_legales)}
                            </td>
                            <td className="px-4 py-3 text-right text-red-700">
                              {formatCurrencyUSD(resultado.deducciones_contractuales)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-blue-700">
                              {formatCurrencyUSD(resultado.neto)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Reporte Tab */}
          {activeTab === 'reporte' && (
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-bean">Reporte de Planilla</h3>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleExportCSV}
                    disabled={resultados.length === 0}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <Download className="h-4 w-4" />
                    <span>Exportar CSV</span>
                  </button>
                  <button
                    onClick={handleExportPDF}
                    disabled={resultados.length === 0}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <FileImage className="h-4 w-4" />
                    <span>Exportar PDF</span>
                  </button>
                  <button
                    onClick={handleGenerateProforma}
                    disabled={resultados.length === 0}
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <Cog className="h-4 w-4" />
                    <span>Generar Proforma (JSON)</span>
                  </button>
                </div>
              </div>

              {resultados.length === 0 ? (
                <div className="text-center py-12">
                  <FileSpreadsheet className="h-16 w-16 text-slate7g mx-auto mb-6" />
                  <h4 className="text-xl font-bold text-bean mb-3">No hay datos para reportar</h4>
                  <p className="text-slate7g mb-6">
                    Ejecuta el cálculo de planilla para generar el reporte.
                  </p>
                </div>
              ) : (
                <>
                  {/* Panel de totales */}
                  {totales && (
                    <div className="mb-8 p-6 bg-off rounded-2xl border border-sand">
                      <h4 className="text-lg font-bold text-bean mb-4">Totales del Período</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-700">
                            {formatCurrencyUSD(totales.total_bruto)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">Bruto Total</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-700">
                            {formatCurrencyUSD(totales.total_legales_emp + totales.total_contractuales)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">Total Deducciones</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-700">
                            {formatCurrencyUSD(totales.total_neto)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">Neto Total</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-700">
                            {formatCurrencyUSD(totales.total_costo_laboral)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">Costo Laboral</div>
                        </div>
                      </div>
                      
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-white rounded-xl">
                          <div className="text-lg font-bold text-orange-700">
                            {formatCurrencyUSD(totales.total_css_patronal)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">CSS Patronal</div>
                        </div>
                        <div className="text-center p-4 bg-white rounded-xl">
                          <div className="text-lg font-bold text-orange-700">
                            {formatCurrencyUSD(totales.total_edu_patronal)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">SE Patronal</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notas informativas */}
                  <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-xl">
                    <div className="text-blue-800">
                      <p className="font-medium mb-2">Notas importantes:</p>
                      <ul className="text-sm space-y-1 list-disc list-inside">
                        <li>El costo laboral incluye aportes patronales (CSS/SE).</li>
                        <li>La proforma es una vista previa; el asiento a GL se implementará en el siguiente paso.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Tabla detallada por empleado */}
                  <div className="overflow-x-auto rounded-xl border border-sand">
                    <table className="min-w-full">
                      <thead className="bg-slate7g text-white">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Empleado</th>
                          <th className="px-4 py-3 text-right font-semibold">Bruto</th>
                          <th className="px-4 py-3 text-right font-semibold">CSS Emp</th>
                          <th className="px-4 py-3 text-right font-semibold">SE Emp</th>
                          <th className="px-4 py-3 text-right font-semibold">ISR</th>
                          <th className="px-4 py-3 text-right font-semibold">Ded. Cont.</th>
                          <th className="px-4 py-3 text-right font-semibold">Neto</th>
                          <th className="px-4 py-3 text-right font-semibold">CSS Pat</th>
                          <th className="px-4 py-3 text-right font-semibold">SE Pat</th>
                          <th className="px-4 py-3 text-right font-semibold">Costo Lab.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultados.map((resultado, index) => (
                          <tr 
                            key={resultado.id}
                            className={`transition-colors duration-150 hover:bg-accent/5 ${
                              index % 2 === 0 ? 'bg-white' : 'bg-off/30'
                            }`}
                          >
                            <td className="px-4 py-3 font-medium text-bean">
                              {resultado.hr_empleado?.nombre}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-green-700">
                              {formatCurrencyUSD(resultado.bruto)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate7g">
                              {formatCurrencyUSD(resultado.detalle['CSS_EMP'] || 0)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate7g">
                              {formatCurrencyUSD(resultado.detalle['EDU_EMP'] || 0)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate7g">
                              {formatCurrencyUSD(resultado.detalle['ISR'] || 0)}
                            </td>
                            <td className="px-4 py-3 text-right text-red-700">
                              {formatCurrencyUSD(resultado.deducciones_contractuales)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-blue-700">
                              {formatCurrencyUSD(resultado.neto)}
                            </td>
                            <td className="px-4 py-3 text-right text-orange-700">
                              {formatCurrencyUSD(resultado.css_patronal)}
                            </td>
                            <td className="px-4 py-3 text-right text-orange-700">
                              {formatCurrencyUSD(resultado.edu_patronal)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-purple-700">
                              {formatCurrencyUSD(resultado.costo_laboral_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Reporte Tab */}
          {activeTab === 'reporte' && (
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-bean">Reporte de Planilla</h3>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleExportCSV}
                    disabled={resultados.length === 0}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <Download className="h-4 w-4" />
                    <span>Exportar CSV</span>
                  </button>
                  <button
                    onClick={handleExportPDF}
                    disabled={resultados.length === 0}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <FileImage className="h-4 w-4" />
                    <span>Exportar PDF</span>
                  </button>
                  <button
                    onClick={handleGenerateProforma}
                    disabled={resultados.length === 0}
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <Cog className="h-4 w-4" />
                    <span>Generar Proforma (JSON)</span>
                  </button>
                </div>
              </div>

              {resultados.length === 0 ? (
                <div className="text-center py-12">
                  <FileSpreadsheet className="h-16 w-16 text-slate7g mx-auto mb-6" />
                  <h4 className="text-xl font-bold text-bean mb-3">No hay datos para reportar</h4>
                  <p className="text-slate7g mb-6">
                    Ejecuta el cálculo de planilla para generar el reporte.
                  </p>
                </div>
              ) : (
                <>
                  {/* Panel de totales */}
                  {totales && (
                    <div className="mb-8 p-6 bg-off rounded-2xl border border-sand">
                      <h4 className="text-lg font-bold text-bean mb-4">Totales del Período</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-700">
                            {formatCurrencyUSD(totales.total_bruto)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">Bruto Total</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-700">
                            {formatCurrencyUSD(totales.total_legales_emp + totales.total_contractuales)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">Total Deducciones</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-700">
                            {formatCurrencyUSD(totales.total_neto)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">Neto Total</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-700">
                            {formatCurrencyUSD(totales.total_costo_laboral)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">Costo Laboral</div>
                        </div>
                      </div>
                      
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-white rounded-xl">
                          <div className="text-lg font-bold text-orange-700">
                            {formatCurrencyUSD(totales.total_css_patronal)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">CSS Patronal</div>
                        </div>
                        <div className="text-center p-4 bg-white rounded-xl">
                          <div className="text-lg font-bold text-orange-700">
                            {formatCurrencyUSD(totales.total_edu_patronal)}
                          </div>
                          <div className="text-sm font-medium text-slate7g">SE Patronal</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notas informativas */}
                  <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-xl">
                    <div className="text-blue-800">
                      <p className="font-medium mb-2">Notas importantes:</p>
                      <ul className="text-sm space-y-1 list-disc list-inside">
                        <li>El costo laboral incluye aportes patronales (CSS/SE).</li>
                        <li>La proforma es una vista previa; el asiento a GL se implementará en el siguiente paso.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Tabla detallada por empleado */}
                  <div className="overflow-x-auto rounded-xl border border-sand">
                    <table className="min-w-full">
                      <thead className="bg-slate7g text-white">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Empleado</th>
                          <th className="px-4 py-3 text-right font-semibold">Bruto</th>
                          <th className="px-4 py-3 text-right font-semibold">CSS Emp</th>
                          <th className="px-4 py-3 text-right font-semibold">SE Emp</th>
                          <th className="px-4 py-3 text-right font-semibold">ISR</th>
                          <th className="px-4 py-3 text-right font-semibold">Ded. Cont.</th>
                          <th className="px-4 py-3 text-right font-semibold">Neto</th>
                          <th className="px-4 py-3 text-right font-semibold">CSS Pat</th>
                          <th className="px-4 py-3 text-right font-semibold">SE Pat</th>
                          <th className="px-4 py-3 text-right font-semibold">Costo Lab.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultados.map((resultado, index) => (
                          <tr 
                            key={resultado.id}
                            className={`transition-colors duration-150 hover:bg-accent/5 ${
                              index % 2 === 0 ? 'bg-white' : 'bg-off/30'
                            }`}
                          >
                            <td className="px-4 py-3 font-medium text-bean">
                              {resultado.hr_empleado?.nombre}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-green-700">
                              {formatCurrencyUSD(resultado.bruto)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate7g">
                              {formatCurrencyUSD(resultado.detalle['CSS_EMP'] || 0)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate7g">
                              {formatCurrencyUSD(resultado.detalle['EDU_EMP'] || 0)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate7g">
                              {formatCurrencyUSD(resultado.detalle['ISR'] || 0)}
                            </td>
                            <td className="px-4 py-3 text-right text-red-700">
                              {formatCurrencyUSD(resultado.deducciones_contractuales)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-blue-700">
                              {formatCurrencyUSD(resultado.neto)}
                            </td>
                            <td className="px-4 py-3 text-right text-orange-700">
                              {formatCurrencyUSD((resultado as any).css_patronal || 0)}
                            </td>
                            <td className="px-4 py-3 text-right text-orange-700">
                              {formatCurrencyUSD((resultado as any).edu_patronal || 0)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-purple-700">
                              {formatCurrencyUSD((resultado as any).costo_laboral_total || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* CSV Modal */}
        {showCSVModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 max-h-[80vh] overflow-y-auto">
              <h3 className="text-2xl font-bold text-bean mb-6">Cargar Entradas desde CSV</h3>
              
              {csvFiles.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-16 w-16 text-slate7g mx-auto mb-4" />
                  <p className="text-slate7g">No hay archivos CSV disponibles</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {csvFiles.map((file, index) => (
                    <div key={index} className="border border-sand rounded-xl p-4 hover:bg-off/50 transition-all duration-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-bean">{file.file.name}</h4>
                          {file.manifest && (
                            <p className="text-sm text-slate7g">
                              {file.manifest.rows} filas • {file.manifest.uploadedAt ? new Date(file.manifest.uploadedAt).toLocaleDateString() : ''}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleLoadCSV(file.file.path)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-200"
                        >
                          Cargar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-8">
                <button
                  onClick={() => setShowCSVModal(false)}
                  className="px-6 py-3 border border-sand text-slate7g rounded-2xl hover:bg-off transition-all duration-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Deducción Form Modal */}
        {showDeduccionForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
              <h3 className="text-2xl font-bold text-bean mb-6">Nueva Deducción</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-bean mb-2">Empleado</label>
                  <select
                    value={newDeduccion.empleado_id}
                    onChange={(e) => setNewDeduccion(prev => ({ ...prev, empleado_id: e.target.value }))}
                    className="w-full px-4 py-3 border border-sand rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    required
                  >
                    <option value="">Seleccionar empleado</option>
                    {empleados.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-bean mb-2">Tipo</label>
                  <select
                    value={newDeduccion.tipo}
                    onChange={(e) => setNewDeduccion(prev => ({ ...prev, tipo: e.target.value as keyof typeof TIPOS_DEDUCCION }))}
                    className="w-full px-4 py-3 border border-sand rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  >
                    {Object.entries(TIPOS_DEDUCCION).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-bean mb-2">Monto Total</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newDeduccion.monto_total}
                    onChange={(e) => setNewDeduccion(prev => ({ ...prev, monto_total: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border border-sand rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-bean mb-2">Cuota por Período</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newDeduccion.cuota_periodo}
                    onChange={(e) => setNewDeduccion(prev => ({ ...prev, cuota_periodo: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border border-sand rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-bean mb-2">Prioridad</label>
                  <input
                    type="number"
                    min="1"
                    value={newDeduccion.prioridad}
                    onChange={(e) => setNewDeduccion(prev => ({ ...prev, prioridad: parseInt(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 border border-sand rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-bean mb-2">Fecha de Inicio</label>
                  <input
                    type="date"
                    value={newDeduccion.inicio}
                    onChange={(e) => setNewDeduccion(prev => ({ ...prev, inicio: e.target.value }))}
                    className="w-full px-4 py-3 border border-sand rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div className="flex space-x-4 mt-8">
                <button
                  onClick={() => setShowDeduccionForm(false)}
                  className="flex-1 px-4 py-3 border border-sand text-slate7g rounded-2xl hover:bg-off transition-all duration-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateDeduccion}
                  disabled={!newDeduccion.empleado_id || !newDeduccion.monto_total || !newDeduccion.cuota_periodo}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-2xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  Crear Deducción
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};