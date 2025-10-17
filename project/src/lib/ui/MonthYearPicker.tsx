import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

interface MonthYearPickerProps {
  value: { mes: number; año: number };
  onChange: (value: { mes: number; año: number }) => void;
  disabled?: boolean;
  className?: string;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const MonthYearPicker = ({ 
  value, 
  onChange, 
  disabled = false,
  className = '' 
}: MonthYearPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const handleMonthSelect = (mes: number) => {
    onChange({ ...value, mes });
    setIsOpen(false);
  };

  const handleYearSelect = (año: number) => {
    onChange({ ...value, año });
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-4 py-3 border border-sand rounded-2xl bg-white transition-all duration-200 ${
          disabled 
            ? 'bg-gray-50 text-gray-400 cursor-not-allowed' 
            : 'hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent'
        }`}
      >
        <div className="flex items-center space-x-3">
          <Calendar className="h-5 w-5 text-slate7g" />
          <span className="text-bean font-medium">
            {MESES[value.mes - 1]} {value.año}
          </span>
        </div>
        <ChevronDown 
          className={`h-5 w-5 text-slate7g transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>

      {isOpen && !disabled && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-sand rounded-2xl shadow-xl z-20 overflow-hidden">
            {/* Selector de año */}
            <div className="p-4 border-b border-sand bg-off">
              <label className="block text-sm font-medium text-slate7g mb-2">
                Año
              </label>
              <select
                value={value.año}
                onChange={(e) => handleYearSelect(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-sand rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* Selector de mes */}
            <div className="p-2">
              <div className="grid grid-cols-3 gap-1">
                {MESES.map((mes, index) => (
                  <button
                    key={index}
                    onClick={() => handleMonthSelect(index + 1)}
                    className={`px-3 py-2 text-sm rounded-xl transition-all duration-200 ${
                      value.mes === index + 1
                        ? 'bg-accent text-white font-medium'
                        : 'text-bean hover:bg-off hover:text-accent'
                    }`}
                  >
                    {mes}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};