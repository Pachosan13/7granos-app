import React, { useState, useEffect } from 'react';
import { Users, CreditCard as Edit, Building2, Shield, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface UserProfile {
  user_id: string;
  rol: string;
  is_admin: boolean;
}

interface Sucursal {
  id: string;
  nombre: string;
  activa: boolean;
}

interface UserSucursal {
  user_id: string;
  sucursal_id: string;
  sucursal: {
    nombre: string;
  };
}

const AdminUsuarios: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [userSucursales, setUserSucursales] = useState<UserSucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [assignedSucursales, setAssignedSucursales] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, sucursalesRes, userSucursalesRes] = await Promise.all([
        supabase
          .from('user_profile')
          .select('user_id, rol, is_admin'),
        supabase
          .from('sucursal')
          .select('*')
          .eq('activa', true)
          .order('nombre'),
        supabase
          .from('user_sucursal')
          .select(`
            user_id,
            sucursal_id,
            sucursal!inner(nombre)
          `)
      ]);

      if (usersRes.error) throw usersRes.error;
      if (sucursalesRes.error) throw sucursalesRes.error;
      if (userSucursalesRes.error) throw userSucursalesRes.error;

      setUsers(usersRes.data || []);
      setSucursales(sucursalesRes.data || []);
      setUserSucursales(userSucursalesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('user_profile')
        .update({ 
          rol: newRole,
          is_admin: newRole === 'admin'
        })
        .eq('user_id', userId);

      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error('Error updating user role:', error);
    }
  };

  const openAssignModal = (user: UserProfile) => {
    setSelectedUser(user);
    const userAssignments = userSucursales
      .filter(us => us.user_id === user.user_id)
      .map(us => us.sucursal_id);
    setAssignedSucursales(userAssignments);
    setShowAssignModal(true);
  };

  const saveAssignments = async () => {
    if (!selectedUser) return;
    
    setSaving(true);
    try {
      // Delete existing assignments
      await supabase
        .from('user_sucursal')
        .delete()
        .eq('user_id', selectedUser.user_id);

      // Insert new assignments
      if (assignedSucursales.length > 0) {
        const assignments = assignedSucursales.map(sucursalId => ({
          user_id: selectedUser.user_id,
          sucursal_id: sucursalId
        }));

        const { error } = await supabase
          .from('user_sucursal')
          .insert(assignments);

        if (error) throw error;
      }

      await fetchData();
      setShowAssignModal(false);
      setSelectedUser(null);
    } catch (error) {
      console.error('Error saving assignments:', error);
    } finally {
      setSaving(false);
    }
  };

  const getUserSucursales = (userId: string) => {
    return userSucursales
      .filter(us => us.user_id === userId)
      .map(us => us.sucursal.nombre);
  };

  const getRoleBadge = (rol: string, isAdmin: boolean) => {
    if (isAdmin) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
          <Shield className="w-3 h-3 mr-1" />
          Admin
        </span>
      );
    }

    const colors = {
      contador: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      gerente: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[rol as keyof typeof colors] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'}`}>
        <User className="w-3 h-3 mr-1" />
        {rol.charAt(0).toUpperCase() + rol.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse"></div>
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
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Usuarios & Accesos
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Gestiona usuarios, roles y asignaciones de sucursales
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rol
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sucursales
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Users className="w-5 h-5 text-gray-400 mr-3" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {user.user_id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={user.rol}
                      onChange={(e) => updateUserRole(user.user_id, e.target.value)}
                      className="text-sm border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="gerente">Gerente</option>
                      <option value="contador">Contador</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {getUserSucursales(user.user_id).map((sucursal, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                        >
                          <Building2 className="w-3 h-3 mr-1" />
                          {sucursal}
                        </span>
                      ))}
                      {getUserSucursales(user.user_id).length === 0 && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Sin asignaciones
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => openAssignModal(user)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 flex items-center space-x-1"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Asignar</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assignment Modal */}
      {showAssignModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Asignar Sucursales
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Usuario: {selectedUser.user_id}
              </p>
              
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {sucursales.map((sucursal) => (
                  <label key={sucursal.id} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={assignedSucursales.includes(sucursal.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAssignedSucursales([...assignedSucursales, sucursal.id]);
                        } else {
                          setAssignedSucursales(assignedSucursales.filter(id => id !== sucursal.id));
                        }
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-900 dark:text-white">
                      {sucursal.nombre}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end space-x-3 pt-6">
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveAssignments}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsuarios;

export { AdminUsuarios };