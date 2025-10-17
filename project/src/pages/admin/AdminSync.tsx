import React, { useState, useEffect } from 'react';
import { RefreshCw, Play, Clock, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format, subDays, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface Sucursal {
  id: string;
  nombre: string;
  activa: boolean;
}

interface SyncLog {
  id: string;
  sucursal_id: string;
  tipo: string;
  origen: string;
  started_at: string;
  finished_at: string | null;
  estado: string;
  mensaje: string | null;
  sucursal: {
    nombre: string;
  };
}

interface SyncPrefs {
  id: string;
  sucursal_id: string;
  habilitado: boolean;
  frecuencia: string;
  run_at: string;
  sucursal: {
    nombre: string;
  };
}

const AdminSync: React.FC = () => {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [syncPrefs, setSyncPrefs] = useState<SyncPrefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [dateRange, setDateRange] = useState({
    desde: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    hasta: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sucursalesRes, syncLogsRes, syncPrefsRes] = await Promise.all([
        supabase
          .from('sucursal')
          .select('*')
          .eq('activa', true)
          .order('nombre'),
        supabase
          .from('sync_log')
          .select(`
            *,
            sucursal!inner(nombre)
          `)
          .eq('tipo', 'ventas')
          .order('started_at', { ascending: false })
          .limit(50),
        supabase
          .from('sync_prefs')
          .select(`
            *,
            sucursal!inner(nombre)
          `)
          .order('updated_at', { ascending: false })
      ]);

      if (sucursalesRes.error) throw sucursalesRes.error;
      if (syncLogsRes.error) throw syncLogsRes.error;
      if (syncPrefsRes.error) throw syncPrefsRes.error;

      setSucursales(sucursalesRes.data || []);
      setSyncLogs(syncLogsRes.data || []);
      setSyncPrefs(syncPrefsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async (sucursalId?: string) => {
    const targetSucursales = sucursalId ? [sucursalId] : sucursales.map(s => s.id);
    
    for (const id of targetSucursales) {
      setSyncing(prev => ({ ...prev, [id]: true }));
    }

    try {
      const functionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE ||
                          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

      const url = `${functionsUrl}/sync-ventas?desde=${dateRange.desde}&hasta=${addDays(new Date(dateRange.hasta), 1).toISOString().split('T')[0]}${sucursalId ? `&sucursal_id=${sucursalId}` : ''}`;

      console.log('[AdminSync] Calling sync endpoint:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Sync result:', result);

      // Refresh data after sync
      setTimeout(() => {
        fetchData();
      }, 2000);

    } catch (error) {
      console.error('Error triggering sync:', error);
    } finally {
      for (const id of targetSucursales) {
        setSyncing(prev => ({ ...prev, [id]: false }));
      }
    }
  };

  const updateSyncPrefs = async (sucursalId: string, prefs: Partial<SyncPrefs>) => {
    try {
      const { error } = await supabase
        .from('sync_prefs')
        .upsert({
          sucursal_id: sucursalId,
          ...prefs
        });

      if (error) throw error;

      // Log audit
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'sync_prefs',
          operation: 'UPDATE',
          record_id: sucursalId,
          changes: prefs
        });

      await fetchData();
    } catch (error) {
      console.error('Error updating sync prefs:', error);
    }
  };

  const getLastSyncForSucursal = (sucursalId: string) => {
    return syncLogs.find(log => log.sucursal_id === sucursalId);
  };

  const getSyncPrefsForSucursal = (sucursalId: string) => {
    return syncPrefs.find(pref => pref.sucursal_id === sucursalId);
  };

  const getNextRunEstimate = (prefs: SyncPrefs) => {
    if (!prefs.habilitado) return 'Deshabilitado';
    
    const now = new Date();
    const [hours, minutes] = prefs.run_at.split(':').map(Number);
    
    let nextRun = new Date();
    nextRun.setHours(hours, minutes, 0, 0);
    
    if (prefs.frecuencia === 'DAILY') {
      if (nextRun <= now) {
        nextRun = addDays(nextRun, 1);
      }
    } else if (prefs.frecuencia === 'HOURLY') {
      nextRun.setMinutes(minutes);
      if (nextRun <= now) {
        nextRun.setHours(nextRun.getHours() + 1);
      }
    }
    
    return format(nextRun, 'dd MMM yyyy HH:mm', { locale: es });
  };

  const getSyncStatusIcon = (estado: string) => {
    switch (estado) {
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'pendiente':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      default:
        return <RefreshCw className="w-5 h-5 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Sincronización
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Gestiona la sincronización de datos con INVU
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={dateRange.desde}
              onChange={(e) => setDateRange({ ...dateRange, desde: e.target.value })}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700 dark:text-white"
            />
            <span className="text-gray-500">-</span>
            <input
              type="date"
              value={dateRange.hasta}
              onChange={(e) => setDateRange({ ...dateRange, hasta: e.target.value })}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700 dark:text-white"
            />
          </div>
          
          <button
            onClick={() => triggerSync()}
            disabled={Object.values(syncing).some(Boolean)}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${Object.values(syncing).some(Boolean) ? 'animate-spin' : ''}`} />
            <span>Sincronizar Todo</span>
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        {sucursales.map((sucursal) => {
          const lastSync = getLastSyncForSucursal(sucursal.id);
          const prefs = getSyncPrefsForSucursal(sucursal.id);
          const isSyncing = syncing[sucursal.id] || false;

          return (
            <div key={sucursal.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <RefreshCw className="w-6 h-6 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {sucursal.nombre}
                  </h3>
                </div>
                
                <button
                  onClick={() => triggerSync(sucursal.id)}
                  disabled={isSyncing}
                  className="flex items-center space-x-2 px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
                >
                  <Play className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Last Sync Status */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Última Sincronización
                  </h4>
                  {lastSync ? (
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        {getSyncStatusIcon(lastSync.estado)}
                        <span className="text-sm text-gray-900 dark:text-white">
                          {lastSync.estado === 'ok' ? 'Exitosa' : 
                           lastSync.estado === 'error' ? 'Error' : 'Pendiente'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(lastSync.started_at), 'dd MMM yyyy HH:mm', { locale: es })}
                      </p>
                      {lastSync.mensaje && (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {lastSync.mensaje}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Sin sincronizaciones previas
                    </p>
                  )}
                </div>

                {/* Sync Preferences */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Preferencias
                  </h4>
                  
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={prefs?.habilitado || false}
                        onChange={(e) => updateSyncPrefs(sucursal.id, { 
                          habilitado: e.target.checked,
                          frecuencia: prefs?.frecuencia || 'DAILY',
                          run_at: prefs?.run_at || '02:00'
                        })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-900 dark:text-white">
                        Sincronización automática
                      </span>
                    </label>
                    
                    {prefs?.habilitado && (
                      <>
                        <select
                          value={prefs.frecuencia}
                          onChange={(e) => updateSyncPrefs(sucursal.id, { 
                            frecuencia: e.target.value,
                            habilitado: true,
                            run_at: prefs.run_at
                          })}
                          className="w-full text-sm border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        >
                          <option value="DAILY">Diario</option>
                          <option value="HOURLY">Cada hora</option>
                          <option value="MANUAL">Manual</option>
                        </select>
                        
                        <input
                          type="time"
                          value={prefs.run_at}
                          onChange={(e) => updateSyncPrefs(sucursal.id, { 
                            run_at: e.target.value,
                            habilitado: true,
                            frecuencia: prefs.frecuencia
                          })}
                          className="w-full text-sm border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Next Run */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Próxima Ejecución
                  </h4>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-900 dark:text-white">
                      {prefs ? getNextRunEstimate(prefs) : 'No configurado'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Sync History */}
      {syncLogs.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Historial Reciente
          </h3>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sucursal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Inicio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Duración
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Mensaje
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {syncLogs.slice(0, 10).map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {log.sucursal.nombre}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {getSyncStatusIcon(log.estado)}
                        <span className="text-sm text-gray-900 dark:text-white">
                          {log.estado}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {format(new Date(log.started_at), 'dd MMM HH:mm', { locale: es })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {log.finished_at ? 
                        `${Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s` : 
                        'En progreso'
                      }
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {log.mensaje || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSync;


export { AdminSync }