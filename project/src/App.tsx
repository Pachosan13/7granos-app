import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Estos módulos deben venir como default:
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import VentasPage from './pages/VentasPage';
import AdminLayout from './pages/admin/AdminLayout';
import CapturaComprasPage from './pages/compras/CapturaComprasPage';
import ProtectedRoute from './components/ProtectedRoute';
import Contabilidad from './pages/Contabilidad';
import { IniciarSesion } from './pages/Auth/IniciarSesion';

// Este sí es nombrado (lo dejas igual)
import { Periodos } from './pages/payroll/Periodos';

export const App = () => (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<IniciarSesion />} />

      {/* Protected routes */}
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
