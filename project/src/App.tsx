import React, { ComponentType } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

/** Util para elegir default o named sin romper */
function pick<T extends ComponentType<any>>(
  mod: Record<string, any>,
  pref: Array<keyof typeof mod>,
  name: string
): T {
  for (const k of pref) {
    const v = (mod as any)[k as string];
    if (typeof v === 'function') return v as T;
  }
  console.warn(`❌ ${name} undefined. Module keys:`, Object.keys(mod));
  const Fallback: ComponentType<any> = () => (
    <div style={{ padding: 24 }}>
      <h3 style={{ marginTop: 0 }}>Vista no disponible: {name}</h3>
      <p>El módulo no exporta el componente esperado. Revisa default/named export.</p>
    </div>
  );
  return Fallback as T;
}

/** Helper de feature flags: solo oculta si es 'false' explícito */
const ff = (v: string | undefined) => (v ?? '').toLowerCase() !== 'false';

/** Imports robustos en modo namespace */
import * as LayoutMod from './components/Layout';
import * as DashboardMod from './pages/Dashboard';
import * as VentasPageMod from './pages/VentasPage';
import * as AdminLayoutMod from './pages/admin/AdminLayout';
import * as CapturaComprasPageMod from './pages/compras/CapturaComprasPage';
import * as ProtectedRouteMod from './components/ProtectedRoute';
import * as ContabilidadMod from './pages/Contabilidad';
import * as MayorPageMod from './pages/contabilidad/MayorPage';
import * as PnLPageMod from './pages/contabilidad/PnLPage';
import * as BalancePageMod from './pages/contabilidad/BalancePage';
import * as ConciliacionPageMod from './pages/contabilidad/ConciliacionPage';
import * as AjustesContablesPageMod from './pages/contabilidad/AjustesContablesPage';
import * as IniciarSesionMod from './pages/Auth/IniciarSesion';
import * as GastosFijosListaMod from './pages/gastos-fijos/Lista';
import * as GastosFijosImportarMod from './pages/gastos-fijos/Importar';
import * as CanalesPageMod from './pages/compras/CanalesPage';

// Payroll
import * as PeriodosMod from './pages/payroll/Periodos';
import * as EmpleadosPageMod from './pages/importar/Empleados';
import * as AttendancePageMod from './payroll/AttendancePage';

// ⚠️ Temporal: usar Calcular DEMO hasta validar render
import * as CalcularDemoMod from './pages/payroll/Calcular.demo';

// ⚠️ Proveedores: si tu proyecto usa otro nombre/ruta, igual caerá en fallback seguro
import * as ProveedoresPageMod from './pages/compras/ProveedoresPage';

/** Resolver componentes (default/named) */
const Layout = pick(LayoutMod, ['default', 'Layout'], 'Layout');
const Dashboard = pick(DashboardMod, ['default', 'Dashboard'], 'Dashboard');
const VentasPage = pick(VentasPageMod, ['default', 'VentasPage'], 'VentasPage');
const AdminLayout = pick(AdminLayoutMod, ['default', 'AdminLayout'], 'AdminLayout');
const CapturaComprasPage = pick(
  CapturaComprasPageMod,
  ['default', 'CapturaComprasPage'],
  'CapturaComprasPage'
);
const ProtectedRoute = pick(ProtectedRouteMod, ['default', 'ProtectedRoute'], 'ProtectedRoute');
const Contabilidad = pick(ContabilidadMod, ['default', 'Contabilidad'], 'Contabilidad');
const ContabilidadMayor = pick(MayorPageMod, ['default', 'MayorPage'], 'ContabilidadMayor');
const ContabilidadPnL = pick(PnLPageMod, ['default', 'PnLPage'], 'ContabilidadPnL');
const ContabilidadBalance = pick(BalancePageMod, ['default', 'BalancePage'], 'ContabilidadBalance');
const ContabilidadConciliacion = pick(
  ConciliacionPageMod,
  ['default', 'ConciliacionPage'],
  'ContabilidadConciliacion'
);
const ContabilidadAjustes = pick(
  AjustesContablesPageMod,
  ['default', 'AjustesContablesPage'],
  'ContabilidadAjustes'
);
const IniciarSesion = pick(IniciarSesionMod, ['default', 'IniciarSesion'], 'IniciarSesion');
const GastosFijosLista = pick(GastosFijosListaMod, ['default'], 'GastosFijosLista');
const GastosFijosImportar = pick(GastosFijosImportarMod, ['default'], 'GastosFijosImportar');
const CanalesPage = pick(CanalesPageMod, ['default', 'CanalesPage'], 'CanalesPage');

// Payroll (no ocultes si no hay variable; solo si es 'false')
const Periodos = pick(PeriodosMod, ['default', 'Periodos'], 'Periodos');
const EmpleadosPage = pick(EmpleadosPageMod, ['default', 'EmpleadosPage'], 'EmpleadosPage');
const AttendancePage = pick(AttendancePageMod, ['default', 'AttendancePage'], 'AttendancePage');
const CalcularDemo = pick(CalcularDemoMod, ['default'], 'CalcularDemo');

// Proveedores
const ProveedoresPage = pick(
  ProveedoresPageMod,
  ['default', 'ProveedoresPage', 'Proveedores'],
  'ProveedoresPage'
);

export const App = () => (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <Routes>
      {/* Ruta pública */}
      <Route path="/login" element={<IniciarSesion />} />

      {/* Rutas protegidas */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/ventas" element={<VentasPage />} />
                <Route path="/contabilidad" element={<Contabilidad />} />
                <Route path="/contabilidad/mayor" element={<ContabilidadMayor />} />
                <Route path="/contabilidad/pnl" element={<ContabilidadPnL />} />
                <Route path="/contabilidad/balance" element={<ContabilidadBalance />} />
                <Route path="/contabilidad/conciliacion" element={<ContabilidadConciliacion />} />
                <Route path="/contabilidad/ajustes" element={<ContabilidadAjustes />} />
                <Route path="/gastos-fijos" element={<GastosFijosLista />} />
                <Route path="/gastos-fijos/importar" element={<GastosFijosImportar />} />

                {/* Compras */}
                <Route path="/compras/captura" element={<CapturaComprasPage />} />
                <Route path="/compras/proveedores" element={<ProveedoresPage />} />
                <Route path="/compras/canales" element={<CanalesPage />} />

                {/* Administración (si ya la usabas así) */}
                <Route path="/admin/*" element={<AdminLayout />} />

                {/* Payroll (no se oculta a menos que flag sea 'false') */}
                {ff(import.meta.env.VITE_FF_PAYROLL_PERIODS) && (
                  <>
                    <Route path="/payroll" element={<Periodos />} />
                    <Route path="/payroll/periodos" element={<Periodos />} />
                    {/* 🔹 Nueva ruta temporal para probar Calcular.demo */}
                    <Route path="/payroll/calcular" element={<CalcularDemo />} />
                  </>
                )}
                {ff(import.meta.env.VITE_FF_PAYROLL_EMPLOYEES) && (
                  <Route path="/payroll/empleados" element={<EmpleadosPage />} />
                )}
                {ff(import.meta.env.VITE_FF_PAYROLL_MARCACIONES) && (
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

export default App;
