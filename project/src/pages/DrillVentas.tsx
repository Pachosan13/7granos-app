import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
  Building2,
  DollarSign,
  Receipt,
  TrendingUp,
  X,
  Clock,
  FileText,
  AlertCircle
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { formatCurrencyUSD, formatDateDDMMYYYY } from '../lib/format';
import { useAuthOrg } from '../context/AuthOrgContext';
import { KPICard } from '../components/KPICard';
import { normalizeSucursalId } from './utils/sucursal';

interface Transaction {
  id: string;
  fecha: string;
  sucursal_id: string;
  sucursal_nombre: string;
  subtotal: number;
  itbms: number;
  total: number;
  propina: number | null;
  num_items: number | null;
  inserted_at: string;
  total_count: number;
}

interface KPIData {
  total_ventas: number;
  total_itbms: number;
  total_propinas: number;
  num_transacciones: number;
  ticket_promedio: number;
}

interface SparklineData {
  fecha: string;
  total_ventas: number;
  num_transacciones: number;
}

interface Sucursal {
  id: string;
  nombre: string;
}

export const DrillVentas = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { sucursales, isViewingAll, sucursalSeleccionada } = useAuthOrg();

  const [fecha, setFecha] = useState<string>(
    searchParams.get('fecha') || new Date().toISOString().split('T')[0]
  );
  const sucursalId = normalizeSucursalId(
    !isViewingAll && sucursalSeleccionada?.id ? String(sucursalSeleccionada.id) : null
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [kpis, setKpis] = useState<KPIData>({
    total_ventas: 0,
    total_itbms: 0,
    total_propinas: 0,
    num_transacciones: 0,
    ticket_promedio: 0
  });
  const [sparkline, setSparkline] = useState<SparklineData[]>([]);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalRecords, setTotalRecords] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [error, setError] = useState<string>('');

  const totalPages = Math.ceil(totalRecords / pageSize);

  useEffect(() => {
    const params = new URLSearchParams();
    if (fecha) params.set('fecha', fecha);
    if (debouncedQuery) params.set('q', debouncedQuery);
    setSearchParams(params);
  }, [fecha, debouncedQuery, setSearchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadTransactions = async () => {
    try {
      const { data, error } = await supabase.rpc('api_detalle_ventas', {
        p_fecha: fecha,
        p_sucursal_id: sucursalId,
        p_query: debouncedQuery || null,
        p_limit: pageSize,
        p_offset: (currentPage - 1) * pageSize
      });

      if (error) throw error;

      setTransactions(data || []);
      if (data && data.length > 0) {
        setTotalRecords(Number(data[0].total_count) || 0);
      } else {
        setTotalRecords(0);
      }
    } catch (err) {
      console.error('Error loading transactions:', err);
      throw err;
    }
  };

  const loadKPIs = async () => {
    try {
      const { data, error } = await supabase.rpc('api_kpis_dia', {
        p_fecha: fecha,
        p_sucursal_id: sucursalId
      });

      if (error) throw error;

      if (data) {
        setKpis(data);
      }
    } catch (err) {
      console.error('Error loading KPIs:', err);
      throw err;
    }
  };

  const loadSparkline = async () => {
    try {
      const { data, error } = await supabase.rpc('api_sparkline_ventas', {
        p_fecha: fecha,
        p_sucursal_id: sucursalId
      });

      if (error) throw error;

      const chartData = (data || []).map((item: any) => ({
        fecha: formatDateDDMMYYYY(item.fecha),
        total_ventas: Number(item.total_ventas),
        num_transacciones: Number(item.num_transacciones),
        isSelected: item.fecha === fecha
      }));

      setSparkline(chartData);
    } catch (err) {
      console.error('Error loading sparkline:', err);
      throw err;
    }
  };

  const loadData = async () => {
    if (!fecha) {
      setError('Fecha es requerida');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      await Promise.all([
        loadTransactions(),
        loadKPIs(),
        loadSparkline()
      ]);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Error cargando datos. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [fecha, sucursalId, isViewingAll, debouncedQuery, currentPage, pageSize]);

  const handleExportCSV = useCallback(() => {
    if (transactions.length === 0) return;

    const csvData = transactions.map(t => ({
      'ID Transacción': t.id,
      'Fecha': formatDateDDMMYYYY(t.fecha),
      'Hora': new Date(t.inserted_at).toLocaleTimeString('es-PA', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      'Sucursal': t.sucursal_nombre,
      'Subtotal': Number(t.subtotal).toFixed(2),
      'ITBMS': Number(t.itbms).toFixed(2),
      'Total': Number(t.total).toFixed(2),
      'Propina': t.propina ? Number(t.propina).toFixed(2) : '0.00',
      'Items': t.num_items || 0
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const sucursalName =
      sucursalId === null
        ? 'todas'
        : sucursales.find((s) => String(s.id) === sucursalId)?.nombre || 'sucursal';
    const timestamp = new Date().getTime();

    link.setAttribute('href', url);
    link.setAttribute('download', `ventas_${fecha}_${sucursalName}_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [transactions, fecha, sucursalId, sucursales]);

  const handleClearFilters = () => {
    setFecha(new Date().toISOString().split('T')[0]);
    setSearchQuery('');
    setCurrentPage(1);
  };

  const LoadingSkeleton = () => (
    <div className="animate-pulse space-y-6">
      <div className="h-16 bg-white dark:bg-gray-800 rounded-2xl"></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-white dark:bg-gray-800 rounded-2xl"></div>
        ))}
      </div>
      <div className="h-64 bg-white dark:bg-gray-800 rounded-2xl"></div>
    </div>
  );

  if (loading && transactions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Breadcrumb & Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <button
                onClick={() => navigate('/dashboard')}
                className="hover:text-accent transition-colors"
              >
                Dashboard
              </button>
              <span>→</span>
              <button
                onClick={() => navigate('/ventas')}
                className="hover:text-accent transition-colors"
              >
                Ventas
              </button>
              <span>→</span>
              <span className="text-gray-900 dark:text-white font-medium">Detalle del Día</span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              Detalle de Ventas - {formatDateDDMMYYYY(fecha)}
            </h1>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-2 px-6 py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl hover:shadow-lg transition-all duration-200 border border-gray-200 dark:border-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Volver</span>
          </button>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 border border-gray-100 dark:border-gray-700"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Calendar className="inline h-4 w-4 mr-1" />
                Fecha
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Building2 className="inline h-4 w-4 mr-1" />
                Sucursales
              </label>
              <div className="px-4 py-3 bg-accent/10 text-accent font-medium rounded-xl border-2 border-accent/20">
                {isViewingAll
                  ? `Filtrando por todas (${sucursales.length})`
                  : sucursalSeleccionada?.nombre || 'Sin sucursal'}
              </div>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Usa el selector en el header para cambiar
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Search className="inline h-4 w-4 mr-1" />
                Buscar ID
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por ID..."
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>

            <div className="flex items-end space-x-2">
              <button
                onClick={handleClearFilters}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Limpiar
              </button>
              <button
                onClick={handleExportCSV}
                disabled={transactions.length === 0}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-accent text-white font-medium rounded-xl hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-5 w-5" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-600 p-4 rounded-xl"
          >
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
            </div>
          </motion.div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <KPICard
            title="Total Ventas"
            value={kpis.total_ventas}
            icon={DollarSign}
            color="bg-gradient-to-br from-green-500 to-emerald-600"
            prefix="$"
          />
          <KPICard
            title="ITBMS"
            value={kpis.total_itbms}
            icon={Receipt}
            color="bg-gradient-to-br from-blue-500 to-cyan-600"
            prefix="$"
          />
          <KPICard
            title="Propinas"
            value={kpis.total_propinas}
            icon={TrendingUp}
            color="bg-gradient-to-br from-purple-500 to-pink-600"
            prefix="$"
          />
          <KPICard
            title="Transacciones"
            value={kpis.num_transacciones}
            icon={Receipt}
            color="bg-gradient-to-br from-orange-500 to-red-600"
          />
          <KPICard
            title="Ticket Promedio"
            value={kpis.ticket_promedio}
            icon={TrendingUp}
            color="bg-gradient-to-br from-indigo-500 to-purple-600"
            prefix="$"
          />
        </div>

        {/* Sparkline Chart */}
        {sparkline.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 border border-gray-100 dark:border-gray-700"
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Tendencia (7 días)
            </h3>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={sparkline}>
                <XAxis dataKey="fecha" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total_ventas"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                {sparkline.map((entry: any, index: number) =>
                  entry.isSelected ? (
                    <ReferenceDot
                      key={index}
                      x={entry.fecha}
                      y={entry.total_ventas}
                      r={8}
                      fill="#10b981"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ) : null
                )}
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Transactions Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Transacciones ({totalRecords.toLocaleString()})
              </h3>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Mostrando {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalRecords)} de {totalRecords}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value={10}>10 por página</option>
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                  <option value={100}>100 por página</option>
                </select>
              </div>
            </div>
          </div>

          {transactions.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                No hay transacciones
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                No se encontraron transacciones con los filtros seleccionados.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Hora
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Sucursal
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Subtotal
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        ITBMS
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Total
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Propina
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Items
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {transactions.map((tx, index) => (
                      <motion.tr
                        key={tx.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() => setSelectedTransaction(tx)}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-900 dark:text-white font-medium">
                              {new Date(tx.inserted_at).toLocaleTimeString('es-PA', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                            {tx.id}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {tx.sucursal_nombre}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {formatCurrencyUSD(tx.subtotal)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {formatCurrencyUSD(tx.itbms)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatCurrencyUSD(tx.total)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {tx.propina ? formatCurrencyUSD(tx.propina) : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {tx.num_items || '-'}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-center space-x-2">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronsLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>

                    <div className="flex items-center space-x-1">
                      {[...Array(Math.min(5, totalPages))].map((_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }

                        return (
                          <button
                            key={i}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                              currentPage === pageNum
                                ? 'bg-accent text-white'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronsRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* Transaction Detail Modal */}
        <AnimatePresence>
          {selectedTransaction && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTransaction(null)}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              >
                <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    Detalle de Transacción
                  </h3>
                  <button
                    onClick={() => setSelectedTransaction(null)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">ID de Transacción</div>
                    <div className="text-lg font-mono font-bold text-gray-900 dark:text-white">
                      {selectedTransaction.id}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Fecha</div>
                      <div className="text-base font-semibold text-gray-900 dark:text-white">
                        {formatDateDDMMYYYY(selectedTransaction.fecha)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Hora</div>
                      <div className="text-base font-semibold text-gray-900 dark:text-white">
                        {new Date(selectedTransaction.inserted_at).toLocaleTimeString('es-PA', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sucursal</div>
                    <div className="text-base font-semibold text-gray-900 dark:text-white">
                      {selectedTransaction.sucursal_nombre}
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                      <span className="text-gray-900 dark:text-white font-semibold">
                        {formatCurrencyUSD(selectedTransaction.subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">ITBMS</span>
                      <span className="text-gray-900 dark:text-white font-semibold">
                        {formatCurrencyUSD(selectedTransaction.itbms)}
                      </span>
                    </div>
                    {selectedTransaction.propina && selectedTransaction.propina > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">Propina</span>
                        <span className="text-gray-900 dark:text-white font-semibold">
                          {formatCurrencyUSD(selectedTransaction.propina)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-lg font-bold text-gray-900 dark:text-white">Total</span>
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatCurrencyUSD(selectedTransaction.total)}
                      </span>
                    </div>
                  </div>

                  {selectedTransaction.num_items && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">Número de Items</span>
                        <span className="text-gray-900 dark:text-white font-semibold">
                          {selectedTransaction.num_items}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <details className="cursor-pointer">
                      <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-accent transition-colors">
                        Ver datos raw (JSON)
                      </summary>
                      <pre className="mt-3 p-4 bg-gray-900 text-green-400 rounded-lg text-xs overflow-x-auto font-mono">
                        {JSON.stringify(selectedTransaction, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
