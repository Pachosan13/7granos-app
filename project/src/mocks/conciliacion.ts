export type ConciliacionEstado = 'ok' | 'faltante' | 'sobrante';

export type ConciliacionRow = {
  fecha: string; // ISO date
  sucursal: string;
  ventasInvu: number;
  ventasGl: number;
  depositosBanco: number;
  diferencia: number;
  banco: string;
  estado: ConciliacionEstado;
};

export const conciliacionMockRows: ConciliacionRow[] = [
  {
    fecha: '2024-07-01',
    sucursal: 'San José',
    ventasInvu: 18250.75,
    ventasGl: 17980.15,
    depositosBanco: 18100.5,
    diferencia: 120.35,
    banco: 'Banco Nacional',
    estado: 'sobrante',
  },
  {
    fecha: '2024-07-02',
    sucursal: 'San José',
    ventasInvu: 16500.0,
    ventasGl: 16320.0,
    depositosBanco: 16200.0,
    diferencia: -120.0,
    banco: 'Banco Nacional',
    estado: 'faltante',
  },
  {
    fecha: '2024-07-01',
    sucursal: 'Heredia',
    ventasInvu: 10250.35,
    ventasGl: 10010.0,
    depositosBanco: 10010.0,
    diferencia: 0,
    banco: 'BAC',
    estado: 'ok',
  },
  {
    fecha: '2024-07-02',
    sucursal: 'Heredia',
    ventasInvu: 9800.0,
    ventasGl: 9750.0,
    depositosBanco: 9750.0,
    diferencia: 0,
    banco: 'BAC',
    estado: 'ok',
  },
  {
    fecha: '2024-07-03',
    sucursal: 'San Pedro',
    ventasInvu: 14200.0,
    ventasGl: 14150.0,
    depositosBanco: 13900.0,
    diferencia: -250.0,
    banco: 'Davivienda',
    estado: 'faltante',
  },
  {
    fecha: '2024-07-04',
    sucursal: 'San Pedro',
    ventasInvu: 15050.0,
    ventasGl: 15100.0,
    depositosBanco: 15320.0,
    diferencia: 220.0,
    banco: 'Davivienda',
    estado: 'sobrante',
  },
  {
    fecha: '2024-07-05',
    sucursal: 'Alajuela',
    ventasInvu: 8700.0,
    ventasGl: 8600.0,
    depositosBanco: 8600.0,
    diferencia: 0,
    banco: 'BAC',
    estado: 'ok',
  },
];

export const getConciliacionResumen = (rows: ConciliacionRow[]) => {
  const totals = rows.reduce(
    (acc, row) => {
      acc.ventasInvu += row.ventasInvu;
      acc.ventasGl += row.ventasGl;
      acc.depositosBanco += row.depositosBanco;
      acc.diferencia += row.diferencia;
      return acc;
    },
    { ventasInvu: 0, ventasGl: 0, depositosBanco: 0, diferencia: 0 }
  );

  return totals;
};
