import React, { ComponentType } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

/** Helper: toma default o named y si falta, deja un placeholder visible y loguea */
function pick<T extends ComponentType<any>>(
  mod: Record<string, any>,
  pref: Array<keyof typeof mod>,
  name: string
): T {
  for (const k of pref) {
    const v = mod[k as string];
    if (typeof v === 'function') return v as T;
  }
  console.error(`❌ ${name} está undefined. Keys del módulo:`, Object.keys(mod));
  const Fallback: ComponentType<any> = () => (
    <div style={{ padding: 24, color: '#b91c1c' }}>
      <strong>Componente faltante:</strong> {name}
    </div>
  );
  return Fallback as T;
}

/* ===== Imports como namespace para tolerar default/named ===== */
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

/* ===== Pick robusto (default o named) ===== */
const Layout = pick(LayoutMod, ['default', 'Layout'], 'Layout');
const Dashboard = pick(DashboardMod, ['default', 'Dashboard'], 'Dashboard');
const VentasPage = pick(VentasPageMod, ['default', 'VentasPage'], 'VentasPage');
const AdminLayout = pick(AdminLayoutMod, ['default', 'AdminLayout'], 'AdminLayout');
const CapturaComprasPage = pick(CapturaComprasPageMod, ['default', 'CapturaComprasPage'], 'CapturaComprasPage');

const ProtectedRoute = pick(ProtectedRouteMod, ['default', 'ProtectedRoute'], 'ProtectedRoute');
const Contabilidad = pick(ContabilidadMod, ['default', 'Contabilidad'], 'Contabilidad');
const IniciarSesion = pick(IniciarSesionMod, ['default', 'IniciarSesion'], 'IniciarSesion');

const Periodos = pick(PeriodosMod, ['Periodos', 'default'], 'Periodos');
const EmpleadosPage = pick(EmpleadosPageMod, ['EmpleadosPage', 'default'], 'EmpleadosPage');
const AttendancePage = pick(AttendancePageMod, ['AttendancePage', 'default'], 'AttendancePage');

/* ===== App ===== */
export const App = () => (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <Routes>
      {/* Pública */}
      <Route path="/login" element={<IniciarSesion />} />

      {/* Protegidas */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/ventas" element={<VentasPage />} />
                <Route path="/contabilidad" element={<Contabilidad />} />
                <Route path="/admin/*" element={<AdminLayout />} />
                <Route path="/compras/captura" element={<CapturaComprasPage />} />

                {/* Payroll (feature flags) */}
                {import.meta.env.VITE_FF_PAYROLL_PERIODS === 'true' && (
                  <Route path="/payroll" element={<Periodos />} />
                )}
                {import.meta.env.VITE_FF_PAYROLL_EMPLOYEES === 'true' && (
                  <Route path="/payroll/empleados" element={<EmpleadosPage />} />
                )}
                {import.meta.env.VITE_FF_PAYROLL_MARCACIONES === 'true' && (
                  <Route path="/payroll/marcaciones" element={<AttendancePage />} />
                )}
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  </BrowserRouter>
);
