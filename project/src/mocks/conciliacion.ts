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

export type AjusteContable = {
  id: string;
  fecha: string;
  sucursalId: string;
  sucursalNombre: string;
  cuentaDebito: string;
  cuentaCredito: string;
  monto: number;
  motivo: 'diferencia_banco' | 'error_invu' | 'error_humano' | 'otro';
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  referenciaConciliacionId?: string;
  descripcion?: string;
  creadoPor: string;
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

export const ajustesMock: AjusteContable[] = [
  {
    id: 'AJ-001',
    fecha: '2024-07-03',
    sucursalId: 'SJ',
    sucursalNombre: 'San José',
    cuentaDebito: '1105-01 Caja general',
    cuentaCredito: '4010-02 Ventas INVU',
    monto: 220.0,
    motivo: 'diferencia_banco',
    estado: 'pendiente',
    referenciaConciliacionId: '2024-07-01-San Jose-BN',
    descripcion: 'Ajuste por depósito no reflejado en banco',
    creadoPor: 'G. Rojas',
  },
  {
    id: 'AJ-002',
    fecha: '2024-07-04',
    sucursalId: 'HER',
    sucursalNombre: 'Heredia',
    cuentaDebito: '1201-03 Bancos BAC',
    cuentaCredito: '4010-01 Ventas GL',
    monto: 180.5,
    motivo: 'error_invu',
    estado: 'aprobado',
    referenciaConciliacionId: '2024-07-02-Heredia-BAC',
    descripcion: 'Corrección por factura duplicada en INVU',
    creadoPor: 'M. Campos',
  },
  {
    id: 'AJ-003',
    fecha: '2024-07-05',
    sucursalId: 'SP',
    sucursalNombre: 'San Pedro',
    cuentaDebito: '5101-05 Diferencias de caja',
    cuentaCredito: '1201-04 Bancos Davivienda',
    monto: 250.0,
    motivo: 'error_humano',
    estado: 'pendiente',
    referenciaConciliacionId: '2024-07-03-San Pedro-Davi',
    descripcion: 'Depósito registrado con monto incorrecto',
    creadoPor: 'J. Solano',
  },
  {
    id: 'AJ-004',
    fecha: '2024-07-06',
    sucursalId: 'ALA',
    sucursalNombre: 'Alajuela',
    cuentaDebito: '1201-02 Bancos Nacional',
    cuentaCredito: '4010-03 Ventas tarjetas',
    monto: 95.75,
    motivo: 'diferencia_banco',
    estado: 'aprobado',
    descripcion: 'Ajuste por comisión bancaria no registrada',
    creadoPor: 'L. Fernández',
  },
  {
    id: 'AJ-005',
    fecha: '2024-07-07',
    sucursalId: 'SJ',
    sucursalNombre: 'San José',
    cuentaDebito: '5101-01 Gastos operativos',
    cuentaCredito: '2101-01 Proveedores',
    monto: 130.0,
    motivo: 'error_humano',
    estado: 'rechazado',
    descripcion: 'Solicitud no procedente por documentación incompleta',
    creadoPor: 'P. González',
  },
  {
    id: 'AJ-006',
    fecha: '2024-07-08',
    sucursalId: 'HER',
    sucursalNombre: 'Heredia',
    cuentaDebito: '1105-02 Caja chica',
    cuentaCredito: '4010-02 Ventas INVU',
    monto: 75.3,
    motivo: 'otro',
    estado: 'pendiente',
    descripcion: 'Reclasificación temporal de arqueo',
    creadoPor: 'G. Rojas',
  },
  {
    id: 'AJ-007',
    fecha: '2024-07-02',
    sucursalId: 'SP',
    sucursalNombre: 'San Pedro',
    cuentaDebito: '1201-04 Bancos Davivienda',
    cuentaCredito: '4010-01 Ventas GL',
    monto: 50.0,
    motivo: 'error_invu',
    estado: 'aprobado',
    descripcion: 'Regularización de nota de crédito no aplicada',
    creadoPor: 'M. Campos',
  },
  {
    id: 'AJ-008',
    fecha: '2024-07-01',
    sucursalId: 'ALA',
    sucursalNombre: 'Alajuela',
    cuentaDebito: '5101-05 Diferencias de caja',
    cuentaCredito: '1201-03 Bancos BAC',
    monto: 40.0,
    motivo: 'otro',
    estado: 'rechazado',
    descripcion: 'Ajuste sugerido no aprobado en comité contable',
    creadoPor: 'J. Solano',
  },
];
