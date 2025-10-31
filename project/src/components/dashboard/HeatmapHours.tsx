import React from 'react';

export interface HeatmapPoint {
  hora: number;
  ventas: number;
  tx: number;
}

export interface HeatmapHoursProps {
  data: HeatmapPoint[];
}

const gradientStops = [
  { ratio: 0, color: [241, 245, 249] },
  { ratio: 1, color: [37, 99, 235] },
];

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function intensity(value: number, max: number) {
  const ratio = max <= 0 ? 0 : Math.min(1, value / max);
  const start = gradientStops[0].color;
  const end = gradientStops[1].color;
  const r = lerp(start[0], end[0], ratio);
  const g = lerp(start[1], end[1], ratio);
  const b = lerp(start[2], end[2], ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

export function HeatmapHours({ data }: HeatmapHoursProps) {
  const maxVentas = data.reduce((acc, item) => Math.max(acc, Number(item.ventas) || 0), 0);

  const hours = Array.from({ length: 24 }, (_, index) => index);
  const lookup = new Map<number, HeatmapPoint>();
  data.forEach((item) => lookup.set(item.hora, item));

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Heatmap por hora</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Identifica los picos de ventas durante el día.</p>
      </div>
      <div className="grid grid-cols-6 gap-3 sm:grid-cols-8">
        {hours.map((hour) => {
          const info = lookup.get(hour);
          const ventas = Number(info?.ventas ?? 0);
          return (
            <div
              key={hour}
              className="flex flex-col items-center justify-center rounded-xl border border-slate-100 p-3 text-center text-xs font-medium text-slate-600 transition hover:scale-105 dark:border-slate-800 dark:text-slate-300"
              style={{ background: intensity(ventas, maxVentas) }}
            >
              <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{hour}:00</span>
              <span className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                {ventas.toLocaleString('es-PA', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">TX: {info?.tx ?? 0}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HeatmapHours;
