import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuthOrg } from '../context/AuthOrgContext';
import { shouldUseDemoMode } from '../lib/supabase';

interface Props { children: ReactNode }

export const ProtectedRoute = ({ children }: Props) => {
  const { user, loading, error } = useAuthOrg();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-sand">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="text-bean text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"></div>
            <p>Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-sand p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h2 className="text-2xl font-bold text-bean mb-2">Error de Autenticación</h2>
            <p className="text-slate7g mb-4">{error}</p>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-accent text-white rounded-xl font-medium hover:bg-accent/90 transition-colors"
            >
              Reintentar
            </button>
            <button
              onClick={() => window.location.href = '/login'}
              className="px-6 py-3 bg-sand text-bean rounded-xl font-medium hover:bg-sand/80 transition-colors"
            >
              Ir a inicio de sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user && shouldUseDemoMode) {
    return <>{children}</>;
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
};
