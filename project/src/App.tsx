import { BrowserRouter, Routes, Route } from 'react-router-dom';

// ✅ Todos como named imports (salvo Dashboard, que va como default)
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import { VentasPage } from './pages/VentasPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { CapturaComprasPage } from './pages/compras/CapturaComprasPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Contabilidad } from './pages/Contabilidad';
import { IniciarSesion } from './pages/Auth/IniciarSesion';

// Payroll (UI read-only, detrás de feature flags)
import { Periodos } from './pages/payroll/Periodos';
import { EmpleadosPage } from './pages/importar/Empleados';
import { AttendancePage } from './payroll/AttendancePage'; // <-- ruta real

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

                {/* Payroll (solo si hay flags activadas) */}
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
