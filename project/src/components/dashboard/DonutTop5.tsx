import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrencyUSD } from '../../lib/format';

export interface TopProductItem {
  producto: string;
  qty: number;
  ventas: number;
}

const COLORS = ['#4B2E05', '#D4AF37', '#A16207', '#F97316', '#0EA5E9'];

export interface DonutTop5Props {
  items: TopProductItem[];
}

export function DonutTop5({ items }: DonutTop5Props) {
  const data = items.slice(0, 5).map((item) => ({
    name: item.producto,
    value: Number(item.ventas ?? 0),
  }));

  if (!data.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        Sin ventas de productos en este rango.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="h-60">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, _name, entry) => [formatCurrencyUSD(value), entry?.payload?.name]}
              itemStyle={{ color: '#111' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
        {data.map((item, index) => (
          <li key={item.name} className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              {item.name}
            </span>
            <span className="font-medium text-slate-900 dark:text-white">{formatCurrencyUSD(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DonutTop5;
