import { useState } from 'react';
import { ChevronDown, MapPin, Building2 } from 'lucide-react';
import { useAuthOrg } from '../context/AuthOrgContext';

export const SucursalSwitcher = () => {
  const {
    sucursales,
    sucursalSeleccionada,
    setSucursalSeleccionada,
    viewMode,
    setViewMode,
    isViewingAll
  } = useAuthOrg();
  const [isOpen, setIsOpen] = useState(false);

  if (sucursales.length === 0) {
    return (
      <div className="flex items-center space-x-2 px-4 py-2 bg-red-50 text-red-700 rounded-2xl border border-red-200">
        <MapPin size={16} />
        <span className="text-sm">No tienes sucursales asignadas</span>
      </div>
    );
  }

  const handleSelectAll = () => {
    setViewMode('all');
    setSucursalSeleccionada(null);
    setIsOpen(false);
  };

  const handleSelectSingle = (sucursal: typeof sucursales[0]) => {
    setViewMode('single');
    setSucursalSeleccionada(sucursal);
    setIsOpen(false);
  };

  const displayText = isViewingAll
    ? `Todas (${sucursales.length})`
    : sucursalSeleccionada?.nombre || 'Seleccionar sucursal';

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-sand rounded-2xl hover:bg-off transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 shadow-sm"
      >
        {isViewingAll ? (
          <Building2 size={16} className="text-accent" />
        ) : (
          <MapPin size={16} className="text-slate7g" />
        )}
        <span className={`font-medium ${isViewingAll ? 'text-accent' : 'text-bean'}`}>
          {displayText}
        </span>
        {isViewingAll && (
          <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs font-semibold rounded-full">
            Agregado
          </span>
        )}
        <ChevronDown
          size={16}
          className={`text-slate7g transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 mt-2 w-64 bg-white border border-sand rounded-2xl shadow-lg z-20">
            <div className="py-2">
              <button
                onClick={handleSelectAll}
                className={`w-full text-left px-4 py-3 hover:bg-off transition-colors duration-200 flex items-center justify-between ${
                  isViewingAll
                    ? 'bg-accent text-white'
                    : 'text-bean'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Building2 size={14} />
                  <span className="font-medium">Todas mis sucursales</span>
                </div>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                  isViewingAll
                    ? 'bg-white/20 text-white'
                    : 'bg-accent/10 text-accent'
                }`}>
                  {sucursales.length}
                </span>
              </button>

              <div className="border-t border-sand my-2"></div>

              {sucursales.map((sucursal) => (
                <button
                  key={sucursal.id}
                  onClick={() => handleSelectSingle(sucursal)}
                  className={`w-full text-left px-4 py-3 hover:bg-off transition-colors duration-200 flex items-center space-x-2 ${
                    !isViewingAll && sucursalSeleccionada?.id === sucursal.id
                      ? 'bg-accent text-white'
                      : 'text-bean'
                  }`}
                >
                  <MapPin size={14} />
                  <span>{sucursal.nombre}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
