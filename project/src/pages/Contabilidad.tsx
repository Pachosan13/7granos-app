import { useMemo, useState, type ComponentType } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Users,
  BarChart3,
  Settings, // ✅ Importación correcta
} from 'lucide-react';
import { DashboardTab } from './contabilidad/DashboardTab';
import { DiarioTab } from './contabilidad/DiarioTab';
import { MayorTab } from './contabilidad/MayorTab';
import { AuxiliaresTab } from './contabilidad/AuxiliaresTab';
import { ReportesTab } from './contabilidad/ReportesTab';
import { AdminTab } from './contabilidad/AdminTab';
import { useSearchParams } from 'react-router-dom';
import { useAuthOrg } from '../context/AuthOrgContext';
import { ErrorBoundary } from '../components/ErrorBoundary';

type TabType = 'dashboard' | 'diario' | 'mayor' | 'auxiliares' | 'reportes' | 'admin';

const ALL_TABS: Array<{
  id: TabType;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  requiresAccounting?: boolean;
}> = [
  { id: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'diario',     label: 'Diario',     icon: BookOpen },
  { id: 'mayor',      label: 'Mayor',      icon: FileText },
  { id: 'auxiliares', label: 'Auxiliares', icon: Users },
  { id: 'reportes',   label: 'Reportes',   icon: BarChart3 },
  { id: 'admin',      label: 'Admin',      icon: Settings, requiresAccounting: true },
];

export const Contabilidad = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { perfil } = useAuthOrg();

  // Tab inicial desde URL (con guard por si viene algo inválido)
  const urlTab = (searchParams.get('tab') as TabType) ?? 'dashboard';
  const validTabIds = useMemo(() => new Set(ALL_TABS.map(t => t.id)), []);
  const initialTab: TabType = validTabIds.has(urlTab) ? urlTab : 'dashboard';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('tab', tab);
      return params;
    });
  };

  // Roles permitidos para ver "Admin"
  const hasAccountingRole =
    !!perfil?.rol && ['owner', 'admin', 'accountant'].includes(perfil.rol);

  // Filtra tabs según rol (evita que el botón Admin aparezca sin permiso)
  const visibleTabs = useMemo(
    () =>
      ALL_TABS.filter(tab => (tab.requiresAccounting ? hasAccountingRole : true)),
    [hasAccountingRole]
  );

  return (
    <ErrorBoundary>
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-bean mb-2 tracking-tight">Contabilidad</h1>
          <p className="text-xl text-slate-700">Sistema de gestión contable y reportes financieros</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-green-50 text-green-700 text-sm px-3 py-1 rounded">
            ✓ Contabilidad montada correctamente
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-lg border border-sand overflow-hidden">
          {/* Tab Headers */}
          <div className="border-b border-sand bg-gradient-to-r from-off to-white">
            <div className="flex space-x-1 p-2 overflow-x-auto">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`flex items-center space-x-2 whitespace-nowrap px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                      isActive ? 'bg-accent text-white shadow-md' : 'text-slate-700 hover:text-bean hover:bg-off/50'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon size={18} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-8">
            {activeTab === 'dashboard'  && <DashboardTab />}
            {activeTab === 'diario'     && <DiarioTab />}
            {activeTab === 'mayor'      && <MayorTab />}
            {activeTab === 'auxiliares' && <AuxiliaresTab />}
            {activeTab === 'reportes'   && <ReportesTab />}
            {activeTab === 'admin'      && hasAccountingRole && <AdminTab />}
            {activeTab === 'admin'      && !hasAccountingRole && (
              <div className="text-slate-700">No tienes permisos para ver esta sección.</div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};