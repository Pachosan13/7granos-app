import {
  Home,
  Users,
  Calculator,
  Settings,
  Upload,
  TrendingUp,
  ShoppingCart,
  FileText
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

const menuItems = [
  { to: '/', icon: Home, label: 'Tablero' },
  { to: '/ventas', icon: TrendingUp, label: 'Ventas' },
  { to: '/contabilidad', icon: Calculator, label: 'Contabilidad' },

  // Compras
  { to: '/compras/proveedores', icon: ShoppingCart, label: 'Proveedores' },
  { to: '/compras/captura', icon: FileText, label: 'Captura de compras' },

  { to: '/payroll', icon: Users, label: 'Planilla' },
  { to: '/importar', icon: Upload, label: 'Importar' },
  { to: '/admin', icon: Settings, label: 'Administración' },
];

export const Sidebar = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  return (
    <>
      {/* Overlay móvil */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-40 z-30 transition-opacity ${
          open ? 'opacity-100 visible' : 'opacity-0 invisible'
        } md:hidden`}
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-64 bg-white z-40 border-r border-sand shadow-sm transform transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <nav className="p-6 space-y-2">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? 'bg-accent text-white shadow-md'
                    : 'text-slate7g hover:text-bean hover:bg-off'
                }`
              }
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
};
