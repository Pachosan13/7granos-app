import React, { useState } from 'react';
import { Calculator, Percent, Clock, Settings, Calendar } from 'lucide-react';
import ISRTab from './ISRTab';
import CSSEDUTab from './CSSEDUTab';
import OvertimeTab from './OvertimeTab';
import ConfigTab from './ConfigTab';
import PeriodsTab from './PeriodsTab';

type PlanillaTab = 'isr' | 'css-edu' | 'overtime' | 'config' | 'periods';

const AdminPlanilla: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PlanillaTab>('isr');

  const tabs = [
    { id: 'isr' as PlanillaTab, label: 'ISR', icon: Percent },
    { id: 'css-edu' as PlanillaTab, label: 'CSS & Educativo', icon: Calculator },
    { id: 'overtime' as PlanillaTab, label: 'Horas Extra', icon: Clock },
    { id: 'config' as PlanillaTab, label: 'Configuración', icon: Settings },
    { id: 'periods' as PlanillaTab, label: 'Períodos', icon: Calendar },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'isr':
        return <ISRTab />;
      case 'css-edu':
        return <CSSEDUTab />;
      case 'overtime':
        return <OvertimeTab />;
      case 'config':
        return <ConfigTab />;
      case 'periods':
        return <PeriodsTab />;
      default:
        return <ISRTab />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Administración de Planilla
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Gestiona reglas fiscales, tasas y configuración de planilla
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default AdminPlanilla;