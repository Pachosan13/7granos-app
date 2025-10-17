import React, { useState, useEffect } from 'react';
import { Plus, CreditCard as Edit, Trash2, Percent } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatCurrencyUSD, formatPercentage } from '../../../lib/format';

interface ISRTramo {
  id: number;
  valid_from: string;
  valid_to: string | null;
  bracket_min: number;
  bracket_max: number;
  rate: number;
  fixed_amount: number;
}

const ISRTab: React.FC = () => {
  const [tramos, setTramos] = useState<ISRTramo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTramo, setEditingTramo] = useState<ISRTramo | null>(null);
  const [formData, setFormData] = useState({
    valid_from: new Date().toISOString().split('T')[0],
    valid_to: '',
    bracket_min: 0,
    bracket_max: 0,
    rate: 0,
    fixed_amount: 0
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTramos();
  }, []);

  const fetchTramos = async () => {
    try {
      const { data, error } = await supabase
        .from('rule_isr_tramo')
        .select('*')
        .order('bracket_min');

      if (error) throw error;
      setTramos(data || []);
    } catch (error) {
      console.error('Error fetching ISR tramos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        ...formData,
        valid_to: formData.valid_to || null,
        rate: formData.rate / 100, // Convert percentage to decimal
      };

      if (editingTramo) {
        const { error } = await supabase
          .from('rule_isr_tramo')
          .update(payload)
          .eq('id', editingTramo.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('rule_isr_tramo')
          .insert([payload]);

        if (error) throw error;
      }

      await fetchTramos();
      setShowModal(false);
      setEditingTramo(null);
      setFormData({
        valid_from: new Date().toISOString().split('T')[0],
        valid_to: '',
        bracket_min: 0,
        bracket_max: 0,
        rate: 0,
        fixed_amount: 0
      });
    } catch (error) {
      console.error('Error saving ISR tramo:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este tramo de ISR?')) return;

    try {
      const { error } = await supabase
        .from('rule_isr_tramo')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchTramos();
    } catch (error) {
      console.error('Error deleting ISR tramo:', error);
    }
  };

  const openEditModal = (tramo: ISRTramo) => {
    setEditingTramo(tramo);
    setFormData({
      valid_from: tramo.valid_from,
      valid_to: tramo.valid_to || '',
      bracket_min: tramo.bracket_min,
      bracket_max: tramo.bracket_max,
      rate: tramo.rate * 100, // Convert decimal to percentage
      fixed_amount: tramo.fixed_amount
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingTramo(null);
    setFormData({
      valid_from: new Date().toISOString().split('T')[0],
      valid_to: '',
      bracket_min: 0,
      bracket_max: 0,
      rate: 0,
      fixed_amount: 0
    });
    setShowModal(true);
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
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
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
            Tramos de ISR
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Gestiona los tramos del Impuesto Sobre la Renta
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Agregar Tramo</span>
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rango
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tasa
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Monto Fijo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Vigencia
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {tramos.map((tramo) => (
                <tr key={tramo.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {formatCurrencyUSD(tramo.bracket_min)} - {formatCurrencyUSD(tramo.bracket_max)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Percent className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900 dark:text-white">
                        {formatPercentage(tramo.rate)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {formatCurrencyUSD(tramo.fixed_amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {tramo.valid_from} {tramo.valid_to && `- ${tramo.valid_to}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => openEditModal(tramo)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(tramo.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {editingTramo ? 'Editar Tramo ISR' : 'Nuevo Tramo ISR'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Desde
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.bracket_min}
                      onChange={(e) => setFormData({ ...formData, bracket_min: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Hasta
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.bracket_max}
                      onChange={(e) => setFormData({ ...formData, bracket_max: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tasa (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.rate}
                      onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Monto Fijo
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.fixed_amount}
                      onChange={(e) => setFormData({ ...formData, fixed_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Vigente desde
                    </label>
                    <input
                      type="date"
                      value={formData.valid_from}
                      onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Vigente hasta (opcional)
                    </label>
                    <input
                      type="date"
                      value={formData.valid_to}
                      onChange={(e) => setFormData({ ...formData, valid_to: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ISRTab;