import React, { useState, useEffect } from 'react';
import { Settings, Building2, Save } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface Sucursal {
  id: string;
  nombre: string;
  activa: boolean;
}

interface RuleConfig {
  sucursal_id: string;
  include_tips_in_css: boolean;
  include_tips_in_isr: boolean;
}

const ConfigTab: React.FC = () => {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [configs, setConfigs] = useState<Record<string, RuleConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sucursalesRes, configsRes] = await Promise.all([
        supabase
          .from('sucursal')
          .select('*')
          .eq('activa', true)
          .order('nombre'),
        supabase
          .from('rule_config')
          .select('*')
      ]);

      if (sucursalesRes.error) throw sucursalesRes.error;
      if (configsRes.error) throw configsRes.error;

      setSucursales(sucursalesRes.data || []);
      
      // Convert configs array to object keyed by sucursal_id
      const configsMap: Record<string, RuleConfig> = {};
      (configsRes.data || []).forEach((config: RuleConfig) => {
        configsMap[config.sucursal_id] = config;
      });
      setConfigs(configsMap);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (sucursalId: string, config: Partial<RuleConfig>) => {
    setSaving(prev => ({ ...prev, [sucursalId]: true }));

    try {
      const { error } = await supabase
        .from('rule_config')
        .upsert({
          sucursal_id: sucursalId,
          ...config
        });

      if (error) throw error;

      // Update local state
      setConfigs(prev => ({
        ...prev,
        [sucursalId]: {
          sucursal_id: sucursalId,
          include_tips_in_css: config.include_tips_in_css ?? false,
          include_tips_in_isr: config.include_tips_in_isr ?? true
        }
      }));
    } catch (error) {
      console.error('Error saving config:', error);
    } finally {
      setSaving(prev => ({ ...prev, [sucursalId]: false }));
    }
  };

  const getConfigForSucursal = (sucursalId: string): RuleConfig => {
    return configs[sucursalId] || {
      sucursal_id: sucursalId,
      include_tips_in_css: false,
      include_tips_in_isr: true
    };
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
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Configuración por Sucursal
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Configura las reglas específicas de cálculo de planilla para cada sucursal
        </p>
      </div>

      <div className="space-y-6">
        {sucursales.map((sucursal) => {
          const config = getConfigForSucursal(sucursal.id);
          const isSaving = saving[sucursal.id] || false;

          return (
            <div key={sucursal.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <Building2 className="w-6 h-6 text-blue-600" />
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {sucursal.nombre}
                  </h4>
                </div>
                <Settings className="w-5 h-5 text-gray-400" />
              </div>

              <div className="space-y-6">
                {/* Tips in CSS Configuration */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900 dark:text-white mb-2">
                        Incluir propinas en CSS
                      </h5>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Determina si las propinas deben incluirse en el cálculo de la Caja de Seguro Social.
                        Por defecto, las propinas NO se incluyen en CSS según la legislación panameña.
                      </p>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`css_${sucursal.id}`}
                            checked={!config.include_tips_in_css}
                            onChange={() => saveConfig(sucursal.id, { 
                              ...config, 
                              include_tips_in_css: false 
                            })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            disabled={isSaving}
                          />
                          <span className="ml-2 text-sm text-gray-900 dark:text-white">
                            No incluir (recomendado)
                          </span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`css_${sucursal.id}`}
                            checked={config.include_tips_in_css}
                            onChange={() => saveConfig(sucursal.id, { 
                              ...config, 
                              include_tips_in_css: true 
                            })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            disabled={isSaving}
                          />
                          <span className="ml-2 text-sm text-gray-900 dark:text-white">
                            Incluir
                          </span>
                        </label>
                      </div>
                    </div>
                    {isSaving && (
                      <div className="flex items-center space-x-2 text-blue-600">
                        <Save className="w-4 h-4 animate-pulse" />
                        <span className="text-sm">Guardando...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tips in ISR Configuration */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900 dark:text-white mb-2">
                        Incluir propinas en ISR
                      </h5>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Determina si las propinas deben incluirse en el cálculo del Impuesto Sobre la Renta.
                        Por defecto, las propinas SÍ se incluyen en ISR según la legislación panameña.
                      </p>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`isr_${sucursal.id}`}
                            checked={config.include_tips_in_isr}
                            onChange={() => saveConfig(sucursal.id, { 
                              ...config, 
                              include_tips_in_isr: true 
                            })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            disabled={isSaving}
                          />
                          <span className="ml-2 text-sm text-gray-900 dark:text-white">
                            Incluir (recomendado)
                          </span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`isr_${sucursal.id}`}
                            checked={!config.include_tips_in_isr}
                            onChange={() => saveConfig(sucursal.id, { 
                              ...config, 
                              include_tips_in_isr: false 
                            })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            disabled={isSaving}
                          />
                          <span className="ml-2 text-sm text-gray-900 dark:text-white">
                            No incluir
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Current Configuration Summary */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <h6 className="font-medium text-blue-800 dark:text-blue-300 mb-2">
                    Configuración Actual
                  </h6>
                  <div className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                    <div>
                      <strong>CSS:</strong> Las propinas {config.include_tips_in_css ? 'SÍ' : 'NO'} se incluyen en el cálculo
                    </div>
                    <div>
                      <strong>ISR:</strong> Las propinas {config.include_tips_in_isr ? 'SÍ' : 'NO'} se incluyen en el cálculo
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legal Notice */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-6 border border-yellow-200 dark:border-yellow-800">
        <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
          Nota Legal
        </h4>
        <p className="text-sm text-yellow-700 dark:text-yellow-400 leading-relaxed">
          Esta configuración debe ajustarse según la legislación laboral vigente en Panamá y las políticas 
          específicas de su empresa. Consulte con su contador o asesor legal para asegurar el cumplimiento 
          de todas las obligaciones fiscales y laborales.
        </p>
      </div>
    </div>
  );
};

export default ConfigTab;