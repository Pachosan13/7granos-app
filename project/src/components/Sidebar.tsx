import { useMemo } from 'react';
import {
  Home,
  Users,
  Calculator,
  Settings,
  Upload,
  TrendingUp,
  ShoppingCart,
  FileText,
  BarChart3,
  PieChart,
  Landmark,
  ClipboardCheck,
  LineChart,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

type MenuItem = {
  to: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  children?: MenuItem[];
  depth?: number;
};

const menuItems: MenuItem[] = [
  { to: '/', icon: Home, label: 'Tablero' },
  { to: '/ventas', icon: TrendingUp, label: 'Ventas' },
  {
    to: '/contabilidad',
    icon: Calculator,
    label: 'Contabilidad',
    children: [
      { to: '/contabilidad/mayor', icon: FileText, label: 'Libro Mayor', depth: 1 },
      { to: '/contabilidad/pnl', icon: BarChart3, label: 'P&L mensual', depth: 1 },
      { to: '/contabilidad/balance', icon: PieChart, label: 'Balance general', depth: 1 },
      { to: '/contabilidad/conciliacion', icon: Landmark, label: 'Conciliación', depth: 1 },
      { to: '/contabilidad/ajustes', icon: ClipboardCheck, label: 'Ajustes contables', depth: 1 },
      { to: '/contabilidad/gerencia', icon: LineChart, label: 'Gerencia (sucursal)', depth: 1 },
    ],
  },

  // Compras
  { to: '/compras/proveedores', icon: ShoppingCart, label: 'Proveedores' },
  { to: '/compras/captura', icon: FileText, label: 'Captura de compras' },

  { to: '/payroll', icon: Users, label: 'Planilla' },
  { to: '/importar', icon: Upload, label: 'Importar' },
  { to: '/admin', icon: Settings, label: 'Administración' },
];

const flattenMenu = (items: MenuItem[]): MenuItem[] => {
  const result: MenuItem[] = [];
  items.forEach((item) => {
    result.push(item);
    if (item.children) {
      item.children.forEach((child) => result.push({ ...child, depth: (child.depth ?? 1) }));
    }
  });
  return result;
};

export const Sidebar = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const location = useLocation();
  const flatMenu = useMemo(() => flattenMenu(menuItems), []);

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
          {flatMenu.map((item) => {
            const isChild = (item.depth ?? 0) > 0;
            const isActive = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive: navActive }) => {
                  const active = navActive || isActive;
                  const base = 'flex items-center space-x-3 rounded-2xl transition-all duration-200';
                  const padding = isChild ? 'pl-10 pr-4 py-2.5 text-sm' : 'px-4 py-3 font-medium';
                  const state = active
                    ? 'bg-accent text-white shadow-md'
                    : 'text-slate7g hover:text-bean hover:bg-off';
                  return `${base} ${padding} ${state}`;
                }}
              >
                <Icon size={isChild ? 16 : 20} />
                <span className={isChild ? 'font-medium' : 'font-semibold'}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
