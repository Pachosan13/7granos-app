export type DashboardBaseMetrics = {
  ventasNetas: number;
  margenBruto: number;
  margenOperativo: number;
  cogsFood: number;
  cogsBeverage: number;
  laborCost: number;
  transacciones: number;
};

export type DashboardSerieDia = {
  fecha: string;
  ventas: number;
  margen: number;
};

export type DashboardSucursal = {
  id: string;
  nombre: string;
  ventas: number;
  margenPct: number;
};

export type DashboardProductoTop = {
  producto: string;
  ventas: number;
  margen: number;
};

export const dashboardBaseMetrics7d: DashboardBaseMetrics = {
  ventasNetas: 186_400,
  margenBruto: 98_200,
  margenOperativo: 62_400,
  cogsFood: 44_300,
  cogsBeverage: 18_600,
  laborCost: 23_300,
  transacciones: 4_120,
};

export function getFinancialKpis(base: DashboardBaseMetrics) {
  const safeVentas = base.ventasNetas || 0;
  const ticketPromedio = base.transacciones > 0 ? base.ventasNetas / base.transacciones : 0;

  const pct = (value: number) => (safeVentas > 0 ? (value / safeVentas) * 100 : 0);

  return {
    margenBrutoPct: pct(base.margenBruto),
    margenOperativoPct: pct(base.margenOperativo),
    ticketPromedio,
    foodCostPct: pct(base.cogsFood),
    beverageCostPct: pct(base.cogsBeverage),
    laborCostPct: pct(base.laborCost),
  };
}

export const dashboardSerie30d: DashboardSerieDia[] = Array.from({ length: 30 }, (_, idx) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - idx));
  const ventasBase = 5200 + Math.sin(idx / 3) * 680 + (idx % 6 === 0 ? 900 : 0);
  const margenBase = ventasBase * (0.48 + Math.cos(idx / 4) * 0.04);
  const fecha = date.toLocaleDateString('en-CA');
  return {
    fecha,
    ventas: Math.round(ventasBase),
    margen: Math.round(margenBase),
  };
});

export const dashboardSucursalesMock: DashboardSucursal[] = [
  { id: 'centro', nombre: 'Centro', ventas: 68_400, margenPct: 32.5 },
  { id: 'sanfrancisco', nombre: 'San Francisco', ventas: 52_900, margenPct: 29.1 },
  { id: 'costa', nombre: 'Costa Verde', ventas: 34_700, margenPct: 27.4 },
  { id: 'boquete', nombre: 'Boquete', ventas: 18_900, margenPct: 24.8 },
  { id: 'coronado', nombre: 'Coronado', ventas: 11_500, margenPct: 21.2 },
];

export const dashboardTopProductosMock: DashboardProductoTop[] = [
  { producto: 'Café Geisha Reserva', ventas: 18_400, margen: 9_200 },
  { producto: 'Pan de Masa Madre', ventas: 14_300, margen: 7_100 },
  { producto: 'Bowl Mediterráneo', ventas: 12_700, margen: 6_100 },
  { producto: 'Latte Nitro', ventas: 11_900, margen: 5_800 },
  { producto: 'Emparedado Trufado', ventas: 10_600, margen: 5_000 },
];
