export type DashboardKpi = {
  label: string;
  value: number;
  trend?: number;
  trendLabel?: string;
};

export type DashboardSerieDia = {
  fecha: string;
  ventas: number;
  margen: number;
};

export type DashboardSucursal = {
  sucursalId: string;
  sucursalNombre: string;
  ventas: number;
  margenPorcentaje: number;
};

export type DashboardProductoTop = {
  nombre: string;
  ventas: number;
  margen: number;
};

export type DashboardBaseMetrics = {
  ventasTotales: number;
  costoVentasTotales: number;
  utilidadOperativa: number;
  costoAlimentos: number;
  costoBebidas: number;
  costoManoObra: number;
  numTransacciones: number;
};

export const dashboardBaseMetrics7d: DashboardBaseMetrics = {
  ventasTotales: 71850,
  costoVentasTotales: 43200,
  utilidadOperativa: 12480,
  costoAlimentos: 18250,
  costoBebidas: 9650,
  costoManoObra: 14200,
  numTransacciones: 3890,
};

export type DashboardFinancialKpis = {
  margenBrutoPct: number;
  margenOperativoPct: number;
  foodCostPct: number;
  beverageCostPct: number;
  laborCostPct: number;
  ticketPromedio: number;
};

export function getFinancialKpis(base: DashboardBaseMetrics): DashboardFinancialKpis {
  const ventas = base.ventasTotales || 1;

  return {
    margenBrutoPct: (base.ventasTotales - base.costoVentasTotales) / ventas,
    margenOperativoPct: base.utilidadOperativa / ventas,
    foodCostPct: base.costoAlimentos / ventas,
    beverageCostPct: base.costoBebidas / ventas,
    laborCostPct: base.costoManoObra / ventas,
    ticketPromedio: base.ventasTotales / base.numTransacciones,
  };
}

export const dashboardSerie30d: DashboardSerieDia[] = [
  { fecha: "2024-04-01", ventas: 2050, margen: 610 },
  { fecha: "2024-04-02", ventas: 2140, margen: 645 },
  { fecha: "2024-04-03", ventas: 2210, margen: 680 },
  { fecha: "2024-04-04", ventas: 2280, margen: 700 },
  { fecha: "2024-04-05", ventas: 2400, margen: 760 },
  { fecha: "2024-04-06", ventas: 2620, margen: 820 },
  { fecha: "2024-04-07", ventas: 2750, margen: 870 },
  { fecha: "2024-04-08", ventas: 2480, margen: 760 },
  { fecha: "2024-04-09", ventas: 2360, margen: 720 },
  { fecha: "2024-04-10", ventas: 2440, margen: 760 },
  { fecha: "2024-04-11", ventas: 2510, margen: 785 },
  { fecha: "2024-04-12", ventas: 2680, margen: 860 },
  { fecha: "2024-04-13", ventas: 2790, margen: 900 },
  { fecha: "2024-04-14", ventas: 2860, margen: 920 },
  { fecha: "2024-04-15", ventas: 2420, margen: 740 },
  { fecha: "2024-04-16", ventas: 2380, margen: 720 },
  { fecha: "2024-04-17", ventas: 2490, margen: 765 },
  { fecha: "2024-04-18", ventas: 2570, margen: 800 },
  { fecha: "2024-04-19", ventas: 2700, margen: 860 },
  { fecha: "2024-04-20", ventas: 2920, margen: 940 },
  { fecha: "2024-04-21", ventas: 3050, margen: 990 },
  { fecha: "2024-04-22", ventas: 2810, margen: 880 },
  { fecha: "2024-04-23", ventas: 2640, margen: 820 },
  { fecha: "2024-04-24", ventas: 2520, margen: 780 },
  { fecha: "2024-04-25", ventas: 2460, margen: 760 },
  { fecha: "2024-04-26", ventas: 2580, margen: 810 },
  { fecha: "2024-04-27", ventas: 2760, margen: 890 },
  { fecha: "2024-04-28", ventas: 2880, margen: 930 },
  { fecha: "2024-04-29", ventas: 3010, margen: 980 },
  { fecha: "2024-04-30", ventas: 3150, margen: 1025 },
];

export const dashboardSucursalesMock: DashboardSucursal[] = [
  { sucursalId: "SCL-01", sucursalNombre: "Santiago Centro", ventas: 18250, margenPorcentaje: 0.34 },
  { sucursalId: "SCL-02", sucursalNombre: "Las Condes", ventas: 16480, margenPorcentaje: 0.31 },
  { sucursalId: "VAP-01", sucursalNombre: "Valparaíso Puerto", ventas: 12900, margenPorcentaje: 0.29 },
  { sucursalId: "VAP-02", sucursalNombre: "Viña Mall", ventas: 11240, margenPorcentaje: 0.27 },
];

export const dashboardTopProductosMock: DashboardProductoTop[] = [
  { nombre: "Hamburguesa Doble", ventas: 8200, margen: 3150 },
  { nombre: "Combo Familiar", ventas: 7400, margen: 2800 },
  { nombre: "Wrap Pollo", ventas: 6150, margen: 2240 },
  { nombre: "Café Especialidad", ventas: 4980, margen: 2100 },
  { nombre: "Postre de la Casa", ventas: 4520, margen: 1880 },
];
