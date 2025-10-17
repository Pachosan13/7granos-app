import React, { useState, useEffect } from 'react';
import { Plus, Calculator, TrendingUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatPercentage } from '../../../lib/format';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CSSRate {
  id: number;
  valid_from: string;
  valid_to: string | null;
  employee_pct: number;
  employer_pct: number;
}

interface EDURate {
  id: number;
  valid_from: string;
  valid_to: string | null;
  employee_pct: number;
  employer_pct: number;
}

const CSSEDUTab: React.FC = () => {
  const [cssRates, setCssRates] = useState<CSSRate[]>([]);
  const [eduRates, setEduRates] = useState<EDURate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'css' | 'edu'>('css');
  const [formData, setFormData] = useState({
    valid_from: new Date().toISOString().split('T')[0],
    employee_pct: 0,
    employer_pct: 0
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    try {
      const [cssRes, eduRes] = await Promise.all([
        supabase
          .from('rule_css_rate')
          .select('*')
          .order('valid_from', { ascending: false }),
        supabase
          .from('rule_edu_rate')
          .select('*')
          .order('valid_from', { ascending: false })
      ]);

      if (cssRes.error) throw cssRes.error;
      if (eduRes.error) throw eduRes.error;

      setCssRates(cssRes.data || []);
      setEduRates(eduRes.data || []);
    } catch (error) {
      console.error('Error fetching rates:', error);
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
        employee_pct: formData.employee_pct / 100, // Convert percentage to decimal
        employer_pct: formData.employer_pct / 100, // Convert percentage to decimal
      };

      const table = modalType === 'css' ? 'rule_css_rate' : 'rule_edu_rate';
      
      const { error } = await supabase
        .from(table)
        .insert([payload]);

      if (error) throw error;

      await fetchRates();
      setShowModal(false);
      setFormData({
        valid_from: new Date().toISOString().split('T')[0],
        employee_pct: 0,
        employer_pct: 0
      });
    } catch (error) {
      console.error('Error saving rate:', error);
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = (type: 'css' | 'edu') => {
    setModalType(type);
    setFormData({
      valid_from: new Date().toISOString().split('T')[0],
      employee_pct: 0,
      employer_pct: 0
    });
    setShowModal(true);
  };

  const getCurrentRate = (rates: (CSSRate | EDURate)[]) => {
    const now = new Date();
    return rates.find(rate => {
      const validFrom = new Date(rate.valid_from);
      const validTo = rate.valid_to ? new Date(rate.valid_to) : null;
      return validFrom <= now && (!validTo || validTo >= now);
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  const currentCSSRate = getCurrentRate(cssRates);
  const currentEDURate = getCurrentRate(eduRates);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Tasas CSS y Seguro Educativo
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Gestiona las tasas de Caja de Seguro Social y Seguro Educativo
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CSS Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-3">
              <Calculator className="w-6 h-6 text-blue-600" />
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Caja de Seguro Social
              </h4>
            </div>
            <button
              onClick={() => openCreateModal('css')}
              className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Tasa</span>
            </button>
          </div>

          {currentCSSRate && (
            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <h5 className="font-medium text-green-800 dark:text-green-300 mb-2">Tasa Actual</h5>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-green-700 dark:text-green-400">Empleado:</span>
                  <span className="ml-2 font-semibold">{formatPercentage(currentCSSRate.employee_pct)}</span>
                </div>
                <div>
                  <span className="text-green-700 dark:text-green-400">Patronal:</span>
                  <span className="ml-2 font-semibold">{formatPercentage(currentCSSRate.employer_pct)}</span>
                </div>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Vigente desde: {format(new Date(currentCSSRate.valid_from), 'dd MMM yyyy', { locale: es })}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <h5 className="font-medium text-gray-900 dark:text-white">Historial de Tasas</h5>
            <div className="max-h-48 overflow-y-auto">
              {cssRates.map((rate) => (
                <div key={rate.id} className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                  <div className="text-sm">
                    <div className="text-gray-900 dark:text-white">
                      Emp: {formatPercentage(rate.employee_pct)} | Pat: {formatPercentage(rate.employer_pct)}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs">
                      {format(new Date(rate.valid_from), 'dd MMM yyyy', { locale: es })}
                      {rate.valid_to && ` - ${format(new Date(rate.valid_to), 'dd MMM yyyy', { locale: es })}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* EDU Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-3">
              <TrendingUp className="w-6 h-6 text-purple-600" />
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Seguro Educativo
              </h4>
            </div>
            <button
              onClick={() => openCreateModal('edu')}
              className="flex items-center space-x-2 px-3 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Tasa</span>
            </button>
          </div>

          {currentEDURate && (
            <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <h5 className="font-medium text-purple-800 dark:text-purple-300 mb-2">Tasa Actual</h5>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-purple-700 dark:text-purple-400">Empleado:</span>
                  <span className="ml-2 font-semibold">{formatPercentage(currentEDURate.employee_pct)}</span>
                </div>
                <div>
                  <span className="text-purple-700 dark:text-purple-400">Patronal:</span>
                  <span className="ml-2 font-semibold">{formatPercentage(currentEDURate.employer_pct)}</span>
                </div>
              </div>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                Vigente desde: {format(new Date(currentEDURate.valid_from), 'dd MMM yyyy', { locale: es })}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <h5 className="font-medium text-gray-900 dark:text-white">Historial de Tasas</h5>
            <div className="max-h-48 overflow-y-auto">
              {eduRates.map((rate) => (
                <div key={rate.id} className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                  <div className="text-sm">
                    <div className="text-gray-900 dark:text-white">
                      Emp: {formatPercentage(rate.employee_pct)} | Pat: {formatPercentage(rate.employer_pct)}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs">
                      {format(new Date(rate.valid_from), 'dd MMM yyyy', { locale: es })}
                      {rate.valid_to && ` - ${format(new Date(rate.valid_to), 'dd MMM yyyy', { locale: es })}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Nueva Tasa {modalType === 'css' ? 'CSS' : 'Seguro Educativo'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tasa Empleado (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.employee_pct}
                      onChange={(e) => setFormData({ ...formData, employee_pct: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tasa Patronal (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.employer_pct}
                      onChange={(e) => setFormData({ ...formData, employer_pct: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      required
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

export default CSSEDUTab;