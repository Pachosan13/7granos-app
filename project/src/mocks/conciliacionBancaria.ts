export type BancoSoportado = 'BAC' | 'Banistmo' | 'Banco General';

export type MovimientoBancario = {
  id: string;
  fecha: string;
  banco: BancoSoportado;
  cuenta: string;
  descripcion: string;
  referencia: string;
  monto: number;
  tipo: 'debito' | 'credito';
  conciliadoContra?: 'ventas' | 'gl' | 'ninguno';
  estado: 'conciliado' | 'pendiente' | 'diferencia';
};

export type ArchivoBanco = {
  id: string;
  banco: BancoSoportado;
  nombreArchivo: string;
  fechaCarga: string;
  periodoDesde: string;
  periodoHasta: string;
  totalMovimientos: number;
  totalConciliado: number;
  totalPendiente: number;
  totalDiferencia: number;
};

export const archivosMock: ArchivoBanco[] = [
  {
    id: 'archivo-bac-001',
    banco: 'BAC',
    nombreArchivo: 'BAC_Extracto_Marzo.csv',
    fechaCarga: '2024-03-15',
    periodoDesde: '2024-03-01',
    periodoHasta: '2024-03-15',
    totalMovimientos: 8,
    totalConciliado: 5,
    totalPendiente: 2,
    totalDiferencia: 1,
  },
  {
    id: 'archivo-banistmo-001',
    banco: 'Banistmo',
    nombreArchivo: 'Banistmo_Corte_0315.csv',
    fechaCarga: '2024-03-16',
    periodoDesde: '2024-03-05',
    periodoHasta: '2024-03-16',
    totalMovimientos: 7,
    totalConciliado: 4,
    totalPendiente: 2,
    totalDiferencia: 1,
  },
  {
    id: 'archivo-general-001',
    banco: 'Banco General',
    nombreArchivo: 'General_Extracto_Q1.csv',
    fechaCarga: '2024-03-10',
    periodoDesde: '2024-02-25',
    periodoHasta: '2024-03-10',
    totalMovimientos: 6,
    totalConciliado: 3,
    totalPendiente: 2,
    totalDiferencia: 1,
  },
];

export const movimientosMock: MovimientoBancario[] = [
  {
    id: 'mov-001',
    fecha: '2024-03-01',
    banco: 'BAC',
    cuenta: '00123456789',
    descripcion: 'Ventas POS día 1',
    referencia: 'POS-INV-3001',
    monto: 1520.5,
    tipo: 'credito',
    conciliadoContra: 'ventas',
    estado: 'conciliado',
  },
  {
    id: 'mov-002',
    fecha: '2024-03-02',
    banco: 'BAC',
    cuenta: '00123456789',
    descripcion: 'Depósito nocturno',
    referencia: 'DEP-3301',
    monto: 980.25,
    tipo: 'credito',
    conciliadoContra: 'gl',
    estado: 'conciliado',
  },
  {
    id: 'mov-003',
    fecha: '2024-03-03',
    banco: 'BAC',
    cuenta: '00123456789',
    descripcion: 'Comisión POS',
    referencia: 'COM-3001',
    monto: -45.5,
    tipo: 'debito',
    conciliadoContra: 'ninguno',
    estado: 'pendiente',
  },
  {
    id: 'mov-004',
    fecha: '2024-03-05',
    banco: 'BAC',
    cuenta: '00123456789',
    descripcion: 'Ajuste bancario',
    referencia: 'AJ-555',
    monto: -120.75,
    tipo: 'debito',
    conciliadoContra: 'gl',
    estado: 'diferencia',
  },
  {
    id: 'mov-005',
    fecha: '2024-03-06',
    banco: 'BAC',
    cuenta: '00123456789',
    descripcion: 'Ventas POS día 6',
    referencia: 'POS-INV-3006',
    monto: 1675.9,
    tipo: 'credito',
    conciliadoContra: 'ventas',
    estado: 'conciliado',
  },
  {
    id: 'mov-006',
    fecha: '2024-03-10',
    banco: 'BAC',
    cuenta: '00123456789',
    descripcion: 'Depósito pendiente validación',
    referencia: 'DEP-3006',
    monto: 720.0,
    tipo: 'credito',
    conciliadoContra: 'ninguno',
    estado: 'pendiente',
  },
  {
    id: 'mov-007',
    fecha: '2024-03-12',
    banco: 'BAC',
    cuenta: '00123456789',
    descripcion: 'Reembolso cliente',
    referencia: 'REF-1201',
    monto: -65.0,
    tipo: 'debito',
    conciliadoContra: 'ventas',
    estado: 'conciliado',
  },
  {
    id: 'mov-008',
    fecha: '2024-03-15',
    banco: 'BAC',
    cuenta: '00123456789',
    descripcion: 'Diferencia depósito tardío',
    referencia: 'DEP-TRD-15',
    monto: 210.0,
    tipo: 'credito',
    conciliadoContra: 'gl',
    estado: 'diferencia',
  },
  {
    id: 'mov-009',
    fecha: '2024-03-05',
    banco: 'Banistmo',
    cuenta: '9988776655',
    descripcion: 'Ventas POS sucursal',
    referencia: 'POS-5001',
    monto: 1420.0,
    tipo: 'credito',
    conciliadoContra: 'ventas',
    estado: 'conciliado',
  },
  {
    id: 'mov-010',
    fecha: '2024-03-07',
    banco: 'Banistmo',
    cuenta: '9988776655',
    descripcion: 'Depósito bancario',
    referencia: 'DEP-5002',
    monto: 805.4,
    tipo: 'credito',
    conciliadoContra: 'gl',
    estado: 'pendiente',
  },
  {
    id: 'mov-011',
    fecha: '2024-03-09',
    banco: 'Banistmo',
    cuenta: '9988776655',
    descripcion: 'Comisión mantenimiento',
    referencia: 'COM-0501',
    monto: -32.0,
    tipo: 'debito',
    conciliadoContra: 'ninguno',
    estado: 'pendiente',
  },
  {
    id: 'mov-012',
    fecha: '2024-03-10',
    banco: 'Banistmo',
    cuenta: '9988776655',
    descripcion: 'Ajuste por nota de crédito',
    referencia: 'NC-101',
    monto: 140.0,
    tipo: 'credito',
    conciliadoContra: 'gl',
    estado: 'conciliado',
  },
  {
    id: 'mov-013',
    fecha: '2024-03-12',
    banco: 'Banistmo',
    cuenta: '9988776655',
    descripcion: 'Movimiento desconocido',
    referencia: 'UNK-10',
    monto: 260.0,
    tipo: 'credito',
    conciliadoContra: 'ninguno',
    estado: 'diferencia',
  },
  {
    id: 'mov-014',
    fecha: '2024-03-16',
    banco: 'Banistmo',
    cuenta: '9988776655',
    descripcion: 'Venta fin de semana',
    referencia: 'POS-5010',
    monto: 970.3,
    tipo: 'credito',
    conciliadoContra: 'ventas',
    estado: 'conciliado',
  },
  {
    id: 'mov-015',
    fecha: '2024-02-26',
    banco: 'Banco General',
    cuenta: '5544332211',
    descripcion: 'Ventas terminal',
    referencia: 'POS-401',
    monto: 1120.0,
    tipo: 'credito',
    conciliadoContra: 'ventas',
    estado: 'conciliado',
  },
  {
    id: 'mov-016',
    fecha: '2024-03-01',
    banco: 'Banco General',
    cuenta: '5544332211',
    descripcion: 'Depósito por validar',
    referencia: 'DEP-777',
    monto: 680.5,
    tipo: 'credito',
    conciliadoContra: 'gl',
    estado: 'pendiente',
  },
  {
    id: 'mov-017',
    fecha: '2024-03-03',
    banco: 'Banco General',
    cuenta: '5544332211',
    descripcion: 'Nota de débito',
    referencia: 'ND-003',
    monto: -90.0,
    tipo: 'debito',
    conciliadoContra: 'ninguno',
    estado: 'diferencia',
  },
  {
    id: 'mov-018',
    fecha: '2024-03-05',
    banco: 'Banco General',
    cuenta: '5544332211',
    descripcion: 'Interés bancario',
    referencia: 'INT-05',
    monto: 15.3,
    tipo: 'credito',
    conciliadoContra: 'gl',
    estado: 'conciliado',
  },
  {
    id: 'mov-019',
    fecha: '2024-03-08',
    banco: 'Banco General',
    cuenta: '5544332211',
    descripcion: 'Comisión transferencia',
    referencia: 'COM-08',
    monto: -12.5,
    tipo: 'debito',
    conciliadoContra: 'ninguno',
    estado: 'pendiente',
  },
  {
    id: 'mov-020',
    fecha: '2024-03-10',
    banco: 'Banco General',
    cuenta: '5544332211',
    descripcion: 'Depósito conciliado',
    referencia: 'DEP-900',
    monto: 450.0,
    tipo: 'credito',
    conciliadoContra: 'ventas',
    estado: 'conciliado',
  },
];

export function getResumenConciliacion(movs: MovimientoBancario[]) {
  const base = {
    conciliado: { cantidad: 0, monto: 0 },
    pendiente: { cantidad: 0, monto: 0 },
    diferencia: { cantidad: 0, monto: 0 },
    diferenciaNeta: 0,
  };

  return movs.reduce((acc, mov) => {
    acc[mov.estado].cantidad += 1;
    acc[mov.estado].monto += mov.monto;
    if (mov.estado === 'diferencia') {
      acc.diferenciaNeta += mov.monto;
    }
    return acc;
  }, base);
}
