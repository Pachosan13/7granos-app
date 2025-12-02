export type GerenciaSucursalMetrics = {
  ventasHoy: number;
  ventasAyer: number;
  ticketPromedio: number;
  numTransacciones: number;
  foodCostPct: number;
  beverageCostPct: number;
  laborCostPct: number;
  alertaMarcaciones: number;
  alertaDepositosPendientes: number;
};

export type GerenciaSerieDia = {
  fecha: string;
  sucursal: string;
  ventas: number;
  margenPct: number;
};

export type GerenciaTopProducto = {
  sucursal: string;
  nombre: string;
  totalVentas: number;
  porcentaje: number;
};

export type GerenciaAlerta = {
  sucursal: string;
  tipo: 'Marcación' | 'Caja' | 'Depósito' | 'Inventario';
  mensaje: string;
  criticidad: 'alta' | 'media' | 'baja';
};

export const gerenciaSucursalDefault = 'El Cangrejo';

export const gerenciaSucursalesMock = ['El Cangrejo', 'Costa Verde', 'San Pedro', 'El Dorado'];

export const gerenciaMetricsMock: Record<string, GerenciaSucursalMetrics> = {
  'El Cangrejo': {
    ventasHoy: 23640,
    ventasAyer: 22810,
    ticketPromedio: 15.4,
    numTransacciones: 1540,
    foodCostPct: 0.31,
    beverageCostPct: 0.2,
    laborCostPct: 0.18,
    alertaMarcaciones: 1,
    alertaDepositosPendientes: 1,
  },
  'San Pedro': {
    ventasHoy: 24850,
    ventasAyer: 23120,
    ticketPromedio: 14.8,
    numTransacciones: 1675,
    foodCostPct: 0.32,
    beverageCostPct: 0.21,
    laborCostPct: 0.18,
    alertaMarcaciones: 2,
    alertaDepositosPendientes: 1,
  },
  'Costa Verde': {
    ventasHoy: 18420,
    ventasAyer: 17940,
    ticketPromedio: 12.4,
    numTransacciones: 1482,
    foodCostPct: 0.3,
    beverageCostPct: 0.23,
    laborCostPct: 0.19,
    alertaMarcaciones: 1,
    alertaDepositosPendientes: 0,
  },
  'El Dorado': {
    ventasHoy: 20670,
    ventasAyer: 19850,
    ticketPromedio: 13.2,
    numTransacciones: 1528,
    foodCostPct: 0.31,
    beverageCostPct: 0.22,
    laborCostPct: 0.18,
    alertaMarcaciones: 0,
    alertaDepositosPendientes: 1,
  },
};

const buildSeries = (sucursal: string, baseVentas: number): GerenciaSerieDia[] => {
  const today = new Date();
  const days: GerenciaSerieDia[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const fecha = date.toISOString().slice(0, 10);
    const variacion = (Math.sin(i / 2) + 1) / 10;
    const ventas = Math.round(baseVentas * (0.9 + variacion));
    const margenPct = 0.24 + (Math.cos(i / 3) + 1) / 25;
    days.push({ fecha, sucursal, ventas, margenPct: Number(margenPct.toFixed(3)) });
  }
  return days;
};

export const gerenciaSerie14DiasMock: GerenciaSerieDia[] = [
  ...buildSeries('El Cangrejo', 23500),
  ...buildSeries('San Pedro', 24000),
  ...buildSeries('Costa Verde', 18500),
  ...buildSeries('El Dorado', 20500),
];

export const gerenciaTopProductosMock: GerenciaTopProducto[] = [
  { sucursal: 'El Cangrejo', nombre: 'Combo Burguer Doble', totalVentas: 4620, porcentaje: 0.21 },
  { sucursal: 'El Cangrejo', nombre: 'Wrap Pollo Grill', totalVentas: 3150, porcentaje: 0.14 },
  { sucursal: 'El Cangrejo', nombre: 'Café latte grande', totalVentas: 2740, porcentaje: 0.12 },
  { sucursal: 'El Cangrejo', nombre: 'Smoothie tropical', totalVentas: 2310, porcentaje: 0.11 },
  { sucursal: 'El Cangrejo', nombre: 'Ensalada quinoa', totalVentas: 1900, porcentaje: 0.09 },
  { sucursal: 'San Pedro', nombre: 'Combo Burguer Doble', totalVentas: 4850, porcentaje: 0.22 },
  { sucursal: 'San Pedro', nombre: 'Wrap Pollo Grill', totalVentas: 3320, porcentaje: 0.15 },
  { sucursal: 'San Pedro', nombre: 'Café latte grande', totalVentas: 2875, porcentaje: 0.13 },
  { sucursal: 'San Pedro', nombre: 'Smoothie tropical', totalVentas: 2420, porcentaje: 0.11 },
  { sucursal: 'San Pedro', nombre: 'Ensalada quinoa', totalVentas: 1980, porcentaje: 0.09 },
  { sucursal: 'Costa Verde', nombre: 'Combo Burguer Doble', totalVentas: 4210, porcentaje: 0.21 },
  { sucursal: 'Costa Verde', nombre: 'Wrap Pollo Grill', totalVentas: 2780, porcentaje: 0.14 },
  { sucursal: 'Costa Verde', nombre: 'Café latte grande', totalVentas: 2510, porcentaje: 0.12 },
  { sucursal: 'Costa Verde', nombre: 'Smoothie tropical', totalVentas: 2100, porcentaje: 0.1 },
  { sucursal: 'Costa Verde', nombre: 'Ensalada quinoa', totalVentas: 1750, porcentaje: 0.09 },
  { sucursal: 'El Dorado', nombre: 'Combo Burguer Doble', totalVentas: 4390, porcentaje: 0.21 },
  { sucursal: 'El Dorado', nombre: 'Wrap Pollo Grill', totalVentas: 2910, porcentaje: 0.14 },
  { sucursal: 'El Dorado', nombre: 'Café latte grande', totalVentas: 2630, porcentaje: 0.12 },
  { sucursal: 'El Dorado', nombre: 'Smoothie tropical', totalVentas: 2240, porcentaje: 0.1 },
  { sucursal: 'El Dorado', nombre: 'Ensalada quinoa', totalVentas: 1830, porcentaje: 0.09 },
];

export const gerenciaAlertasMock: GerenciaAlerta[] = [
  {
    sucursal: 'El Cangrejo',
    tipo: 'Marcación',
    mensaje: '1 marcación pendiente de aprobación en apertura.',
    criticidad: 'media',
  },
  {
    sucursal: 'El Cangrejo',
    tipo: 'Depósito',
    mensaje: 'Depósito nocturno sin comprobante adjunto.',
    criticidad: 'alta',
  },
  {
    sucursal: 'El Cangrejo',
    tipo: 'Inventario',
    mensaje: 'Variación inusual en bebidas (+6%).',
    criticidad: 'baja',
  },
  {
    sucursal: 'El Cangrejo',
    tipo: 'Marcación',
    mensaje: 'Empleado llegó pero no marcó entrada (turno tarde).',
    criticidad: 'media',
  },
  {
    sucursal: 'San Pedro',
    tipo: 'Marcación',
    mensaje: '2 marcaciones con diferencias en el turno de apertura.',
    criticidad: 'media',
  },
  {
    sucursal: 'San Pedro',
    tipo: 'Depósito',
    mensaje: 'Depósito de caja de anoche no registrado en banco.',
    criticidad: 'alta',
  },
  {
    sucursal: 'San Pedro',
    tipo: 'Inventario',
    mensaje: 'Variación inusual en consumo de bebidas (+6%).',
    criticidad: 'baja',
  },
  {
    sucursal: 'San Pedro',
    tipo: 'Marcación',
    mensaje: 'Empleado llegó pero no marcó entrada (turno tarde).',
    criticidad: 'media',
  },
  {
    sucursal: 'Costa Verde',
    tipo: 'Caja',
    mensaje: 'Ajuste menor en cuadre de caja (USD 35).',
    criticidad: 'baja',
  },
  {
    sucursal: 'Costa Verde',
    tipo: 'Marcación',
    mensaje: '1 marcación pendiente de aprobación.',
    criticidad: 'media',
  },
  {
    sucursal: 'El Dorado',
    tipo: 'Depósito',
    mensaje: 'Depósito parcial reportado, falta confirmación bancaria.',
    criticidad: 'media',
  },
  {
    sucursal: 'El Dorado',
    tipo: 'Inventario',
    mensaje: 'Alertas en insumos frescos: merma superior al 3%.',
    criticidad: 'baja',
  },
];
