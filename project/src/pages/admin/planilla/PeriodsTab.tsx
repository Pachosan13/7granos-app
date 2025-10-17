import React, { useState, useEffect } from 'react';
import { Calendar, Eye, Calculator, CheckCircle, Clock, Users } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatCurrencyUSD, formatDateDDMMYYYY } from '../../../lib/format';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Periodo {
  id: string;
  sucursal_id: string;
  periodo_mes: number;
  periodo_ano: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: 'borrador' | 'calculado' | 'aprobado' | 'pagado';
  created_at: string;
  sucursal: {
    nombre: string;
  };
}

interface PeriodoTotales {
  id: string;
  periodo_id: string;
  total_bruto: number;
  total_legales_emp: number;
  total_contractuales: number;
  total_neto: number;
  total_css_patronal: number;
  total_edu_patronal: number;
  total_costo_laboral: number;
  detalle: Record<string, any> | null;
}

interface Sucursal {
  id: string;
  nombre: string;
  activa: boolean;
}

const ESTADOS_LABELS = {
  borrador: 'Borrador',
  calculado: 'Calculado',
  aprobado: 'Aprobado',
  pagado: 'Pagado'
};

const ESTADOS_COLORS = {
  borrador: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  calculado: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  aprobado: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  pagado: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const PeriodsTab: React.FC = () => {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [totales, setTotales] = useState<Record<string, PeriodoTotales>>({});
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSucursal, setSelectedSucursal] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [periodosRes, totalesRes, sucursalesRes] = await Promise.all([
        supabase
          .from('hr_periodo')
          .select(`
            *,
            sucursal!inner(nombre)
          `)
          .order('periodo_ano', { ascending: false })
          .order('periodo_mes', { ascending: false }),
        supabase
          .from('hr_periodo_totales')
          .select('*'),
        supabase
          .from('sucursal')
          .select('*')
          .eq('activa', true)
          .order('nombre')
      ]);

      if (periodosRes.error) throw periodosRes.error;
      if (totalesRes.error) throw totalesRes.error;
      if (sucursalesRes.error) throw sucursalesRes.error;

      setPeriodos(periodosRes.data || []);
      setSucursales(sucursalesRes.data || []);
      
      // Convert totales array to object keyed by periodo_id
      const totalesMap: Record<string, PeriodoTotales> = {};
      (totalesRes.data || []).forEach((total: PeriodoTotales) => {
        totalesMap[total.periodo_id] = total;
      });
      setTotales(totalesMap);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPeriodos = selectedSucursal === 'all' 
    ? periodos 
    : periodos.filter(p => p.sucursal_id === selectedSucursal);

  const getTotalesForPeriodo = (periodoId: string): PeriodoTotales | null => {
    return totales[periodoId] || null;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Períodos de Planilla
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Visualiza los períodos de planilla y sus totales calculados
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <select
            value={selectedSucursal}
            onChange={(e) => setSelectedSucursal(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          >
            <option value="all">Todas las sucursales</option>
            {sucursales.map((sucursal) => (
              <option key={sucursal.id} value={sucursal.id}>
                {sucursal.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredPeriodos.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
          <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-6" />
          <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
            No hay períodos
          </h4>
          <p className="text-gray-600 dark:text-gray-400">
            {selectedSucursal === 'all' 
              ? 'No se han creado períodos de planilla aún.'
              : 'No hay períodos para la sucursal seleccionada.'
            }
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Período
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sucursal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Fechas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Bruto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Neto
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredPeriodos.map((periodo) => {
                  const periodTotales = getTotalesForPeriodo(periodo.id);
                  
                  return (
                    <tr key={periodo.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Calendar className="w-5 h-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {MESES[periodo.periodo_mes - 1]} {periodo.periodo_ano}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {format(new Date(periodo.created_at), 'dd MMM yyyy', { locale: es })}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Users className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900 dark:text-white">
                            {periodo.sucursal.nombre}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDateDDMMYYYY(periodo.fecha_inicio)} - {formatDateDDMMYYYY(periodo.fecha_fin)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADOS_COLORS[periodo.estado]}`}>
                          {periodo.estado === 'calculado' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {periodo.estado === 'borrador' && <Clock className="w-3 h-3 mr-1" />}
                          {ESTADOS_LABELS[periodo.estado]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                        {periodTotales ? formatCurrencyUSD(periodTotales.total_bruto) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                        {periodTotales ? formatCurrencyUSD(periodTotales.total_neto) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => window.open(`/payroll/calcular?periodo=${periodo.id}`, '_blank')}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                            title="Ver detalles"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {periodo.estado === 'borrador' && (
                            <button
                              onClick={() => window.open(`/payroll/calcular?periodo=${periodo.id}`, '_blank')}
                              className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                              title="Calcular planilla"
                            >
                              <Calculator className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {filteredPeriodos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Períodos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {filteredPeriodos.length}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Calculados</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {filteredPeriodos.filter(p => p.estado !== 'borrador').length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pendientes</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {filteredPeriodos.filter(p => p.estado === 'borrador').length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Sucursales</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {new Set(filteredPeriodos.map(p => p.sucursal_id)).size}
                </p>
              </div>
              <Users className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeriodsTab;