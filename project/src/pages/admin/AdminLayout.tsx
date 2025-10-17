import React, { useState } from 'react';
import { Building2, Users, Database, RefreshCw, Calculator } from 'lucide-react';
import AdminSucursales from './AdminSucursales';
import AdminUsuarios from './AdminUsuarios';
import AdminInvu from './AdminInvu';
import AdminSync from './AdminSync';
import AdminPlanilla from './planilla/AdminPlanilla';

type AdminTab = 'sucursales' | 'usuarios' | 'invu' | 'sync' | 'planilla';

const AdminLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('sucursales');

  const tabs = [
    { id: 'sucursales' as AdminTab, label: 'Sucursales', icon: Building2 },
    { id: 'usuarios' as AdminTab, label: 'Usuarios', icon: Users },
    { id: 'invu' as AdminTab, label: 'INVU', icon: Database },
    { id: 'sync' as AdminTab, label: 'Sincronización', icon: RefreshCw },
    { id: 'planilla' as AdminTab, label: 'Planilla', icon: Calculator },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'sucursales':
        return <AdminSucursales />;
      case 'usuarios':
        return <AdminUsuarios />;
      case 'invu':
        return <AdminInvu />;
      case 'sync':
        return <AdminSync />;
      case 'planilla':
        return <AdminPlanilla />;
      default:
        return <AdminSucursales />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Administración
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Gestiona sucursales, usuarios, credenciales INVU y sincronización
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm mb-8">
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
        </div>

        {/* Tab Content */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          <div className="p-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;

export { AdminLayout }