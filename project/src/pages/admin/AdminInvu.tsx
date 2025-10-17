import React, { useState, useEffect } from 'react';
import { Database, Eye, EyeOff, TestTube, CheckCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Sucursal {
  id: string;
  nombre: string;
  activa: boolean;
}

interface InvuCredencial {
  id: string;
  sucursal_id: string;
  usuario: string;
  password: string;
  token: string | null;
  token_expires_at: string | null;
  sucursal: {
    nombre: string;
  };
}

const AdminInvu: React.FC = () => {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [credenciales, setCredenciales] = useState<InvuCredencial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [editingCredential, setEditingCredential] = useState<string | null>(null);
  const [formData, setFormData] = useState({ usuario: '', password: '' });
  const [testingLogin, setTestingLogin] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sucursalesRes, credencialesRes] = await Promise.all([
        supabase
          .from('sucursal')
          .select('*')
          .eq('activa', true)
          .order('nombre'),
        supabase
          .from('invu_credenciales')
          .select(`
            *,
            sucursal!inner(nombre)
          `)
          .order('created_at', { ascending: false })
      ]);

      if (sucursalesRes.error) throw sucursalesRes.error;
      if (credencialesRes.error) throw credencialesRes.error;

      setSucursales(sucursalesRes.data || []);
      setCredenciales(credencialesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = (credentialId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [credentialId]: !prev[credentialId]
    }));
  };

  const startEditing = (credential: InvuCredencial) => {
    setEditingCredential(credential.id);
    setFormData({
      usuario: credential.usuario,
      password: credential.password
    });
  };

  const saveCredential = async (sucursalId: string) => {
    try {
      const { error } = await supabase
        .from('invu_credenciales')
        .upsert({
          sucursal_id: sucursalId,
          usuario: formData.usuario,
          password: formData.password
        });

      if (error) throw error;

      // Log audit
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'invu_credenciales',
          operation: 'UPDATE',
          record_id: sucursalId,
          changes: { usuario: formData.usuario }
        });

      await fetchData();
      setEditingCredential(null);
      setFormData({ usuario: '', password: '' });
    } catch (error) {
      console.error('Error saving credential:', error);
    }
  };

  const testLogin = async (credential: InvuCredencial) => {
    setTestingLogin(prev => ({ ...prev, [credential.id]: true }));
    setTestResults(prev => ({ ...prev, [credential.id]: null }));

    try {
      const response = await fetch('https://api.invu.com.pa/userAuth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usuario: credential.usuario,
          password: credential.password
        })
      });

      const result = await response.json();
      const success = response.ok && result.token;

      setTestResults(prev => ({ 
        ...prev, 
        [credential.id]: success ? 'success' : 'error' 
      }));

      // Update token if successful
      if (success) {
        await supabase
          .from('invu_credenciales')
          .update({
            token: result.token,
            token_expires_at: result.expires_at
          })
          .eq('id', credential.id);
      }

      // Log audit
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'invu_credenciales',
          operation: 'TEST_LOGIN',
          record_id: credential.id,
          changes: { test_result: success ? 'SUCCESS' : 'FAILED' }
        });

    } catch (error) {
      console.error('Error testing login:', error);
      setTestResults(prev => ({ 
        ...prev, 
        [credential.id]: 'error' 
      }));
    } finally {
      setTestingLogin(prev => ({ ...prev, [credential.id]: false }));
    }
  };

  const getTokenStatus = (credential: InvuCredencial) => {
    if (!credential.token) {
      return { status: 'none', text: 'Sin token', color: 'text-gray-500' };
    }

    if (!credential.token_expires_at) {
      return { status: 'active', text: 'Token activo', color: 'text-green-600' };
    }

    const expiresAt = new Date(credential.token_expires_at);
    const now = new Date();

    if (expiresAt > now) {
      return { 
        status: 'active', 
        text: `Expira ${format(expiresAt, 'dd MMM yyyy HH:mm', { locale: es })}`, 
        color: 'text-green-600' 
      };
    } else {
      return { 
        status: 'expired', 
        text: `Expiró ${format(expiresAt, 'dd MMM yyyy', { locale: es })}`, 
        color: 'text-red-600' 
      };
    }
  };

  const getCredentialForSucursal = (sucursalId: string) => {
    return credenciales.find(c => c.sucursal_id === sucursalId);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Credenciales INVU
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Gestiona las credenciales de acceso a INVU por sucursal
        </p>
      </div>

      <div className="grid gap-6">
        {sucursales.map((sucursal) => {
          const credential = getCredentialForSucursal(sucursal.id);
          const tokenStatus = credential ? getTokenStatus(credential) : null;
          const isEditing = editingCredential === credential?.id;
          const isTesting = testingLogin[credential?.id || ''] || false;
          const testResult = testResults[credential?.id || ''];

          return (
            <div key={sucursal.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <Database className="w-6 h-6 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {sucursal.nombre}
                  </h3>
                </div>
                {credential && (
                  <div className="flex items-center space-x-2">
                    {testResult === 'success' && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                    {testResult === 'error' && (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                    <button
                      onClick={() => testLogin(credential)}
                      disabled={isTesting}
                      className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
                    >
                      <TestTube className="w-4 h-4" />
                      <span>{isTesting ? 'Probando...' : 'Probar Login'}</span>
                    </button>
                  </div>
                )}
              </div>

              {credential ? (
                <div className="space-y-4">
                  {isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Usuario
                        </label>
                        <input
                          type="text"
                          value={formData.usuario}
                          onChange={(e) => setFormData({ ...formData, usuario: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Contraseña
                        </label>
                        <input
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      <div className="md:col-span-2 flex justify-end space-x-3">
                        <button
                          onClick={() => setEditingCredential(null)}
                          className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => saveCredential(sucursal.id)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Usuario
                        </label>
                        <p className="text-sm text-gray-900 dark:text-white font-mono">
                          {credential.usuario}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Contraseña
                        </label>
                        <div className="flex items-center space-x-2">
                          <p className="text-sm text-gray-900 dark:text-white font-mono">
                            {showPasswords[credential.id] ? credential.password : '••••••••'}
                          </p>
                          <button
                            onClick={() => togglePasswordVisibility(credential.id)}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                          >
                            {showPasswords[credential.id] ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Estado del Token
                        </label>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <p className={`text-sm ${tokenStatus?.color}`}>
                            {tokenStatus?.text}
                          </p>
                        </div>
                      </div>
                      <div className="md:col-span-3 flex justify-end">
                        <button
                          onClick={() => startEditing(credential)}
                          className="px-4 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        >
                          Editar Credenciales
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    No hay credenciales configuradas para esta sucursal
                  </p>
                  <button
                    onClick={() => {
                      setEditingCredential('new-' + sucursal.id);
                      setFormData({ usuario: '', password: '' });
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Configurar Credenciales
                  </button>
                </div>
              )}

              {editingCredential === 'new-' + sucursal.id && (
                <div className="mt-4 space-y-4 border-t pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Usuario
                      </label>
                      <input
                        type="text"
                        value={formData.usuario}
                        onChange={(e) => setFormData({ ...formData, usuario: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        placeholder="Usuario INVU"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Contraseña
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        placeholder="Contraseña INVU"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setEditingCredential(null)}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => saveCredential(sucursal.id)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminInvu;

export { AdminInvu }