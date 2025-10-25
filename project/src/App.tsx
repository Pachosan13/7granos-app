import { BrowserRouter, Routes, Route } from 'react-router-dom';

// ⛔️ Antes: import { Layout } from './components/Layout';
// ✅ Ahora:
import Layout from './components/Layout';

// ⛔️ Antes: import { Dashboard } from './pages/Dashboard';
// ✅ Ahora:
import Dashboard from './pages/Dashboard';

// ⛔️ Antes: import { VentasPage } from './pages/VentasPage';
// ✅ Ahora:
import VentasPage from './pages/VentasPage';

// ⛔️ Antes: import { Periodos } from './pages/payroll/Periodos';
// ✅ Este sí es nombrado — se queda igual:
import { Periodos } from './pages/payroll/Periodos';

// ⛔️ Antes: import { AdminLayout } from './pages/admin/AdminLayout';
// ✅ Revisa si AdminLayout es default o named export.
// La mayoría de implementaciones lo exportan default:
import AdminLayout from './pages/admin/AdminLayout';

// ⛔️ Antes: import CapturaComprasPage from './pages/compras/CapturaComprasPage';
// ✅ Este ya está correcto, se queda igual.
import CapturaComprasPage from './pages/compras/CapturaComprasPage';

// ⛔️ Antes: import { ProtectedRoute } from './components/ProtectedRoute';
// ✅ Si el archivo hace export default ProtectedRoute, cambia así:
import ProtectedRoute from './components/ProtectedRoute';

// ⛔️ Antes: import { Contabilidad } from './pages/Contabilidad';
// ✅ Casi seguro es default, cambia así:
import Contabilidad from './pages/Contabilidad';

// ⛔️ Antes: import { IniciarSesion } from './pages/Auth/IniciarSesion';
// ✅ Igual, casi siempre default:
import IniciarSesion from './pages/Auth/IniciarSesion';

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
                <Route path="/ventas" element={<VentasPage />} />
                <Route path="/payroll/*" element={<Periodos />} />
                <Route path="/contabilidad" element={<Contabilidad />} />
                <Route path="/admin/*" element={<AdminLayout />} />
                <Route path="/compras/captura" element={<CapturaComprasPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  </BrowserRouter>
);
