import { Building2, MapPin, Check } from 'lucide-react';
import { useAuthOrg } from '../context/AuthOrgContext';

interface InlineSucursalSelectorProps {
  className?: string;
  showLabel?: boolean;
}

export const InlineSucursalSelector = ({ className = '', showLabel = true }: InlineSucursalSelectorProps) => {
  const {
    sucursales,
    sucursalSeleccionada,
    setSucursalSeleccionada,
    viewMode,
    setViewMode,
    isViewingAll
  } = useAuthOrg();

  if (sucursales.length === 0) {
    return (
      <div className={`flex items-center space-x-2 px-4 py-2 bg-red-50 text-red-700 rounded-xl border border-red-200 ${className}`}>
        <MapPin size={16} />
        <span className="text-sm font-medium">No tienes sucursales asignadas</span>
      </div>
    );
  }

  const handleSelectAll = () => {
    setViewMode('all');
    setSucursalSeleccionada(null);
  };

  const handleSelectSingle = (sucursal: typeof sucursales[0]) => {
    setViewMode('single');
    setSucursalSeleccionada(sucursal);
  };

  return (
    <div className={className}>
      {showLabel && (
        <label className="block text-sm font-medium text-slate7g dark:text-gray-300 mb-2">
          <Building2 className="inline h-4 w-4 mr-1" />
          Sucursal
        </label>
      )}

      <div className="space-y-2">
        {/* Option: All branches */}
        <button
          onClick={handleSelectAll}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
            isViewingAll
              ? 'border-accent bg-accent text-white shadow-md'
              : 'border-sand bg-white dark:bg-gray-800 text-bean dark:text-white hover:border-accent/50 hover:bg-accent/5'
          }`}
        >
          <div className="flex items-center space-x-3">
            <Building2 className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Todas las sucursales</div>
              <div className={`text-xs ${isViewingAll ? 'text-white/80' : 'text-slate7g dark:text-gray-400'}`}>
                Vista consolidada de {sucursales.length} sucursales
              </div>
            </div>
          </div>
          {isViewingAll && (
            <Check className="h-5 w-5" />
          )}
        </button>

        {/* Individual branches */}
        <div className="space-y-2">
          {sucursales.map((sucursal) => (
            <button
              key={sucursal.id}
              onClick={() => handleSelectSingle(sucursal)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
                !isViewingAll && sucursalSeleccionada?.id === sucursal.id
                  ? 'border-accent bg-accent text-white shadow-md'
                  : 'border-sand bg-white dark:bg-gray-800 text-bean dark:text-white hover:border-accent/50 hover:bg-accent/5'
              }`}
            >
              <div className="flex items-center space-x-3">
                <MapPin className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-semibold">{sucursal.nombre}</div>
                  <div className={`text-xs ${!isViewingAll && sucursalSeleccionada?.id === sucursal.id ? 'text-white/80' : 'text-slate7g dark:text-gray-400'}`}>
                    Vista individual
                  </div>
                </div>
              </div>
              {!isViewingAll && sucursalSeleccionada?.id === sucursal.id && (
                <Check className="h-5 w-5" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Info text */}
      <div className="mt-3 text-xs text-slate7g dark:text-gray-400 px-1">
        {isViewingAll
          ? 'Los datos mostrados son el consolidado de todas tus sucursales'
          : `Viendo datos únicamente de ${sucursalSeleccionada?.nombre}`
        }
      </div>
    </div>
  );
};
