import { ReactNode } from 'react';
import { Filter, RefreshCw } from 'lucide-react';

interface TableToolbarProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  filters?: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
}

export function TableToolbar({
  title,
  subtitle,
  onRefresh,
  filters,
  actions,
  sticky = false,
}: TableToolbarProps) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur ${
        sticky ? 'sticky top-20 z-10' : ''
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-200"
            >
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
          )}
          {actions}
        </div>
      </div>

      {(filters || null) && (
        <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-600">
          <div className="inline-flex items-center gap-2 font-medium text-slate-700">
            <Filter className="h-4 w-4" />
            Filtros
          </div>
          {filters}
        </div>
      )}
    </div>
  );
}
