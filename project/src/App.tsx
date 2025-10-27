import React, { Component, ComponentType } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

/** ------- Utils ------- **/
function pick<T extends ComponentType<any>>(
  mod: Record<string, any>,
  pref: Array<keyof typeof mod>,
  name: string
): T {
  for (const k of pref) {
    const v = (mod as any)[k as string];
    if (typeof v === 'function') return v as T;
  }
  console.error(`❌ ${name} undefined. Module keys:`, Object.keys(mod));
  const Fallback: ComponentType<any> = () => (
    <div style={{ padding: 24, color: '#b91c1c' }}>
      <strong>Componente faltante:</strong> {name}
    </div>
  );
  return Fallback as T;
}

class RouteErrorBoundary extends Component<{ name: string }, { error?: any }> {
  constructor(props: { name: string }) {
    super(props);
    this.state = { error: undefined };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    console.error(`💥 Error renderizando ${this.props.name}`, error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, background: '#fde68a', borderRadius: 8 }}>
          <h3 style={{ color: '#b91c1c', margin: 0 }}>
            Error al renderizar: {this.props.name}
          </h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {(this.state.error && String(this.state.error)) || 'Unknown'}
          </pre>
        </div>
      );
    }
    return this.props.children as any;
  }
}

function safeElement(Comp: ComponentType<any>, name: string, props?: any) {
  return (
    <RouteErrorBoundary name={name}>
      <Comp {...props} />
    </RouteErrorBoundary>
  );
}

/** ------- Imports como namespace (robustos) ------- **/
import * as LayoutMod from './components/Layout';
import * as DashboardMod from './pages/Dashboard';
import * as VentasPageMod from './pages/VentasPage';
import * as AdminLayoutMod from './pages/admin/AdminLayout';
import * as CapturaComprasPageMod from './pages/compras/CapturaComprasPage';

import * as ProtectedRouteMod from './components/ProtectedRoute';
import * as ContabilidadMod from './pages/Contabilidad';
import * as IniciarSesionMod from './pages/Auth/IniciarSesion';

import * as PeriodosMod from './pages/payroll/Periodos';
import * as EmpleadosPageMod from './pages/importar/Empleados';
import * as AttendancePageMod from './payroll/AttendancePage';

/** ------- Log de keys para ver exports reales ------- **/
console.log('🔎 Module keys:', {
  Layout: Object.keys(LayoutMod),
  Dashboard: Object.keys(DashboardMod),
  VentasPage: Object.keys(VentasPageMod),
  AdminLayout: Object.keys(AdminLayoutMod),
  CapturaComprasPage: Object.keys(CapturaComprasPageMod),
  ProtectedRoute: Object.keys(ProtectedRouteMod),
  Contabilidad: Object.keys(ContabilidadMod),
  IniciarSesion: Object.keys(IniciarSesionMod),
  Periodos: Object.keys(PeriodosMod),
  EmpleadosPage: Object.keys(EmpleadosPageMod),
  AttendancePage: Object.keys(AttendancePageMod),
});

/** ------- Resolve default/named ------- **/
const Layout = pick(LayoutMod, ['default', 'Layout'], 'Layout');
const Dashboard = pick(DashboardMod, ['default', 'Dashboard'], 'Dashboard');
const VentasPage = pick(VentasPageMod, ['default', 'VentasPage'], 'VentasPage');
const AdminLayout = pick(AdminLayoutMod, ['default', 'AdminLayout'], 'AdminLayout');
const CapturaComprasPage = pick(
  CapturaComprasPageMod,
  ['default', 'CapturaComprasPage'],
  'CapturaComprasPage'
);

const ProtectedRoute = pick(
  ProtectedRouteMod,
  ['default', 'ProtectedRoute'],
  'ProtectedRoute'
);
const Contabilidad = pick(
  ContabilidadMod,
  ['default', 'Contabilidad'],
  'Contabilidad'
);
const IniciarSesion = pick(
  IniciarSesionMod,
  ['default', 'IniciarSesion'],
  'IniciarSesion'
);

const Periodos = pick(PeriodosMod, ['Periodos', 'default'], 'Periodos');
const EmpleadosPage = pick(
  EmpleadosPageMod,
  ['EmpleadosPage', 'default'],
  'EmpleadosPage'
);
const AttendancePage = pick(
  AttendancePageMod,
  ['AttendancePage', 'default'],
  'AttendancePage'
);

/** ------- App ------- **/
export const App = () => (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <Routes>
      {/* Pública */}
      <Route path="/login" element={safeElement(IniciarSesion, 'IniciarSesion')} />

      {/* Protegidas */}
      <Route
        path="/*"
        element={safeElement(ProtectedRoute, 'ProtectedRoute', {
          children: safeElement(Layout, 'Layout', {
            children: (
              <Routes>
                <Route path="/" element={safeElement(Dashboard, 'Dashboard')} />
                <Route path="/ventas" element={safeElement(VentasPage, 'VentasPage')} />
                <Route
                  path="/contabilidad"
                  element={safeElement(Contabilidad, 'Contabilidad')}
                />
                <Route path="/admin/*" element={safeElement(AdminLayout, 'AdminLayout')} />
                <Route
                  path="/compras/captura"
                  element={safeElement(CapturaComprasPage, 'CapturaComprasPage')}
                />

                {/* Payroll (feature flags) */}
                {import.meta.env.VITE_FF_PAYROLL_PERIODS === 'true' && (
                  <Route path="/payroll" element={safeElement(Periodos, 'Periodos')} />
                )}
                {import.meta.env.VITE_FF_PAYROLL_EMPLOYEES === 'true' && (
                  <Route
                    path="/payroll/empleados"
                    element={safeElement(EmpleadosPage, 'EmpleadosPage')}
                  />
                )}
                {import.meta.env.VITE_FF_PAYROLL_MARCACIONES === 'true' && (
                  <Route
                    path="/payroll/marcaciones"
                    element={safeElement(AttendancePage, 'AttendancePage')}
                  />
                )}
              </Routes>
            ),
          }),
        })}
      />
    </Routes>
  </BrowserRouter>
);
