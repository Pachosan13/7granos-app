import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export interface AlertPillProps {
  level: 'info' | 'warn';
  message: string;
  code?: string;
}

export function AlertPill({ level, message }: AlertPillProps) {
  const isWarn = level === 'warn';
  const Icon = isWarn ? AlertTriangle : Info;
  const bg = isWarn ? 'bg-rose-50 text-rose-700 ring-rose-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  const border = isWarn ? 'border-rose-200' : 'border-emerald-200';
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border ${border} px-4 py-2 text-sm font-medium ${bg} shadow-sm transition hover:shadow`}
      role="status"
    >
      <Icon className="h-4 w-4" />
      <span>{message}</span>
      {!isWarn ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
    </div>
  );
}

export default AlertPill;
