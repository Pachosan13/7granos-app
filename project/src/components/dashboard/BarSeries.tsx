import React from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrencyUSD } from '../../lib/format';

type SeriesPoint = {
  d: string;
  ventas_netas: number;
  itbms?: number | null;
  tx: number;
};

export interface BarSeriesProps {
  data: SeriesPoint[];
}

export function BarSeries({ data }: BarSeriesProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="d"
          stroke="#64748b"
          fontSize={12}
          tickFormatter={(value) => {
            if (typeof value !== 'string') {
              return String(value ?? '');
            }
            return value.length > 5 ? value.slice(5) : value;
          }}
        />
        <YAxis
          yAxisId="left"
          stroke="#64748b"
          fontSize={12}
          width={80}
          tickFormatter={(v: number) => formatCurrencyUSD(v)}
        />
        <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={12} width={60} />
        <Tooltip
          formatter={(value, name) => {
            if (name === 'Ventas') {
              return [formatCurrencyUSD(Number(value)), 'Ventas'];
            }
            return [Number(value).toLocaleString('es-PA'), 'Transacciones'];
          }}
          labelFormatter={(label) => {
            if (typeof label !== 'string') {
              return String(label ?? '—');
            }
            const parsed = new Date(label);
            if (Number.isNaN(parsed.getTime())) {
              return label;
            }
            try {
              return parsed.toLocaleDateString('es-PA', { day: '2-digit', month: 'short' });
            } catch {
              return label;
            }
          }}
        />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="ventas_netas"
          name="Ventas"
          stroke="#4B2E05"
          fill="rgba(75, 46, 5, 0.15)"
          strokeWidth={2}
        />
        <Bar yAxisId="right" dataKey="tx" name="Transacciones" fill="#10b981" radius={[8, 8, 0, 0]} barSize={28} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default BarSeries;
