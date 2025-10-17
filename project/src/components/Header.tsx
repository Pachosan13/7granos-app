import { Menu } from 'lucide-react';

export const Header = ({ onToggleMenu }: { onToggleMenu?: () => void }) => {
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-sand shadow-sm sticky top-0 z-50">
      <button
        className="md:hidden p-2 rounded-lg hover:bg-gray-100"
        onClick={onToggleMenu}
        aria-label="Abrir menú"
      >
        <Menu size={22} />
      </button>
      <h1 className="text-lg font-semibold text-gray-800">
        Centro de Control 7 Granos
      </h1>
    </header>
  );
};
