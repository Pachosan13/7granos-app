import { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  BarChart3,
  Settings,
} from 'lucide-react';
import { DashboardTab } from './contabilidad/DashboardTab';
import { DiarioTab } from './contabilidad/DiarioTab';
// ⛔️ Removido: MayorTab (ya existe la vista “Libro Mayor” en el sidebar)
import { ReportesTab } from './contabilidad/ReportesTab';
import { AdminTab } from './contabilidad/AdminTab';
import { useSearchParams } from 'react-router-dom';
import { useAuthOrg } from '../context/AuthOrgContext';
import { ErrorBoundary } from '../components/ErrorBoundary';

// ⛳️ Feature flag para ocultar Auxiliares (placeholder) si aún no está listo.
const SHOW_AUXILIARES = false;

// Tabs permitidos (sin "mayor")
type TabType = 'dashboard' | 'diario' | 'auxiliares' | 'reportes' | 'admin';

type TabDef = {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  requiresAccounting?: boolean;
  enabled?: boolean;
};

const ALL_TABS: TabDef[] = [
  { id: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard, enabled: true },
  { id: 'diario',     label: 'Diario',     icon: BookOpen,        enabled: true },
  { id: 'auxiliares', label: 'Auxiliares', icon: Users,           enabled: SHOW_AUXILIARES },
  { id: 'reportes',   label: 'Reportes',   icon: BarChart3,       enabled: true },
  { id: 'admin',      label: 'Admin',      icon: Settings,        requiresAccounting: true, enabled: true },
];

export const Contabilidad = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { perfil } = useAuthOrg();

  // Filtra por "enabled" primero (evita mostrar Auxiliares si está apagado)
  const enabledTabs = useMemo(() => ALL_TABS.filter(t => t.enabled !== false), []);

  // Autorización para Admin
  const hasAccountingRole = !!perfil?.rol && ['owner', 'admin', 'accountant'].includes(perfil.rol);

  // Tabs visibles según permisos
  const visibleTabs = useMemo(
    () => enabledTabs.filter(t => (t.requiresAccounting ? hasAccountingRole : true)),
    [enabledTabs, hasAccountingRole]
  );

  // Tab inicial desde URL (si viene uno inválido o deshabilitado, cae a dashboard)
  const urlTab = (searchParams.get('tab') as TabType) ?? 'dashboard';
  const validTabIds = useMemo(() => new Set(visibleTabs.map(t => t.id)), [visibleTabs]);
  const initialTab: TabType = validTabIds.has(urlTab) ? urlTab : 'dashboard';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

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
                    className={`flex items-center space-x-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 whitespace-nowrap ${
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
            {/* ⛔️ Removido: {activeTab === 'mayor' && <MayorTab />}  */}
            {/* Auxiliares sólo si está habilitado */}
            {SHOW_AUXILIARES && activeTab === 'auxiliares' && (
              <div className="text-slate-700">Auxiliares (CxP) — Próximamente</div>
            )}
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
