import { Layout } from '../components/Layout';
import { useAuthOrg } from '../context/AuthOrgContext';

export const Tablero = () => {
  const { profile, sucursalSeleccionada, loading, error } = useAuthOrg();

  // Prioriza is_admin sobre el string rol
  const displayRol =
    profile?.is_admin ? 'admin' : (profile?.rol ?? '—');

  if (loading) {
    return (
      <Layout>
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"></div>
            <p className="text-slate-700">Cargando información...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="text-center text-red-600">
            <p>Error: {error}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8">
        <h2 className="text-3xl font-bold text-bean mb-4">Bienvenido a 7 Granos</h2>

        <div className="space-y-4">
          <p className="text-slate-700 text-lg">
            Tu sistema de gestión empresarial está listo para usar.
          </p>

          {profile && (
            <div className="bg-off p-4 rounded-2xl">
              <p className="text-bean">
                <span className="font-medium">Rol:</span> {displayRol}
              </p>

              {sucursalSeleccionada ? (
                <p className="text-bean">
                  <span className="font-medium">Sucursal actual:</span>{' '}
                  {sucursalSeleccionada.nombre}
                </p>
              ) : (
                <p className="text-bean">
                  <span className="font-medium">Sucursal actual:</span>{' '}
                  {profile?.is_admin
                    ? 'Admin: verás todas las sucursales (elige una si tu UI lo requiere).'
                    : 'No tienes sucursales asignadas.'}
                </p>
              )}
            </div>
          )}
        </div>
    </div>
  );
};
