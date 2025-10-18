import { getFunctionsBase } from '../utils/diagnostics';

/**
 * Servicio mock para integración con INVU
 * En el futuro se reemplazará con llamadas reales a la API de INVU
 */

export interface INVUCredentials {
  usuario: string;
  password: string;
}

export interface INVULoginResponse {
  token: string;
  expires: Date;
}

export interface InvuMovementRecord {
  id_movimiento?: string | number;
  idMovimiento?: string | number;
  id?: string | number;
  id_empleado?: string | number;
  idEmpleado?: string | number;
  empleado_id?: string | number;
  fecha?: string | number | Date;
  fecha_movimiento?: string | number | Date;
  fecha_hora?: string | number | Date;
  date?: string | number | Date;
  tipo?: number | string;
  [key: string]: unknown;
}

export interface InvuEmployeeMovements {
  id_empleado?: string | number;
  idEmpleado?: string | number;
  empleado_id?: string | number;
  nombre?: string;
  movimientos?: InvuMovementRecord[];
  [key: string]: unknown;
}

export interface InvuMovementsResponse {
  empleados?: InvuEmployeeMovements[];
  movimientos?: InvuMovementRecord[];
  data?: InvuMovementRecord[] | InvuEmployeeMovements[];
  [key: string]: unknown;
}

export type InvuMovementType = 'clock_in' | 'clock_out';

export interface FlattenedInvuMovement {
  id_movimiento: string;
  id_empleado: string;
  fecha: string;
  tipo: InvuMovementType;
  raw_tipo?: number | string | null;
  original?: InvuMovementRecord;
}

const MOVEMENT_TYPE_MAP: Record<number, InvuMovementType> = {
  1: 'clock_in',
  2: 'clock_out',
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const trimLeadingSlash = (value: string) => value.replace(/^\/+/, '');

const coerceMovementType = (value: InvuMovementRecord['tipo']): { tipo: InvuMovementType | null; raw: number | string | null } => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { tipo: MOVEMENT_TYPE_MAP[value] ?? null, raw: value };
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return { tipo: MOVEMENT_TYPE_MAP[parsed] ?? null, raw: value };
    }
    return { tipo: null, raw: value };
  }

  return { tipo: null, raw: value ?? null };
};

const normalizeMovementDate = (value: InvuMovementRecord['fecha']): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      const ms = trimmed.length >= 13 ? parsed : parsed * 1000;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
};

const resolveMovementId = (movement: InvuMovementRecord): string | null => {
  const rawId = movement.id_movimiento ?? movement.idMovimiento ?? movement.id;
  if (rawId === undefined || rawId === null || rawId === '') {
    return null;
  }
  return String(rawId);
};

const resolveEmployeeId = (movement: InvuMovementRecord, fallback?: string | number | null): string | null => {
  const rawEmployeeId = movement.id_empleado ?? movement.idEmpleado ?? movement.empleado_id ?? fallback;
  if (rawEmployeeId === undefined || rawEmployeeId === null || rawEmployeeId === '') {
    return null;
  }
  return String(rawEmployeeId);
};

const mapEmployeeRecordId = (employee: InvuEmployeeMovements): string | null => {
  const rawEmployeeId = employee.id_empleado ?? employee.idEmpleado ?? employee.empleado_id;
  if (rawEmployeeId === undefined || rawEmployeeId === null || rawEmployeeId === '') {
    return null;
  }
  return String(rawEmployeeId);
};

const isMovementRecord = (value: unknown): value is InvuMovementRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as InvuMovementRecord;
  return (
    record.id_movimiento !== undefined ||
    record.idMovimiento !== undefined ||
    record.id !== undefined ||
    record.fecha !== undefined ||
    record.fecha_movimiento !== undefined ||
    record.fecha_hora !== undefined ||
    record.date !== undefined
  );
};

const isEmployeeRecord = (value: unknown): value is InvuEmployeeMovements => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as InvuEmployeeMovements;
  return Array.isArray(record.movimientos);
};

export async function getEmployeeMovements({
  fini,
  ffin,
  token,
  baseUrl = import.meta.env.VITE_INVU_BASE_URL || import.meta.env.INVU_BASE_URL,
  authHeader = import.meta.env.VITE_INVU_AUTH_HEADER || import.meta.env.INVU_AUTH_HEADER || 'Authorization',
  path = import.meta.env.VITE_INVU_ATTENDANCE_REMOTE_PATHS || import.meta.env.INVU_ATTENDANCE_REMOTE_PATHS || 'empleados/movimientos',
}: {
  fini: number;
  ffin: number;
  token: string;
  baseUrl?: string;
  authHeader?: string;
  path?: string;
}): Promise<InvuMovementsResponse> {
  if (!Number.isFinite(fini) || !Number.isFinite(ffin)) {
    throw new Error('Parámetros fini/ffin inválidos. Deben ser epoch en segundos.');
  }

  if (!token || !token.trim()) {
    throw new Error('Token INVU requerido.');
  }

  if (!baseUrl || !baseUrl.trim()) {
    throw new Error('INVU_BASE_URL no configurado.');
  }

  const sanitizedAuthHeader = authHeader?.trim() || 'Authorization';
  const sanitizedBaseUrl = trimTrailingSlash(baseUrl.trim());
  const sanitizedPath = trimLeadingSlash(path?.trim() || 'empleados/movimientos');

  const start = Math.trunc(fini);
  const end = Math.trunc(ffin);

  const url = `${sanitizedBaseUrl}/invuApiPos/index.php?r=${sanitizedPath}/fini/${start}/ffin/${end}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        [sanitizedAuthHeader]: token.trim(),
        Accept: 'application/json',
      },
    });
  } catch (error) {
    throw new Error(
      `No se pudo conectar a la API de INVU: ${error instanceof Error ? error.message : 'Error desconocido'}`
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('Token inválido o vencido (INVU)');
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const snippet = body ? `: ${body.slice(0, 200)}` : '';
    throw new Error(`Error consultando movimientos de INVU (${response.status})${snippet}`);
  }

  try {
    const data = (await response.json()) as InvuMovementsResponse;
    return data;
  } catch (error) {
    throw new Error('Respuesta de INVU inválida: JSON malformado.');
  }
}

export const flattenInvuMovements = (response: InvuMovementsResponse | null | undefined): FlattenedInvuMovement[] => {
  if (!response) {
    return [];
  }

  const flattened: FlattenedInvuMovement[] = [];
  const seen = new Set<string>();

  const registerMovement = (movement: InvuMovementRecord | null | undefined, fallbackEmployeeId?: string | number | null) => {
    if (!movement) {
      return;
    }

    const { tipo, raw } = coerceMovementType(movement.tipo);
    if (!tipo) {
      return;
    }

    const idMovimiento = resolveMovementId(movement);
    if (!idMovimiento) {
      return;
    }

    const idEmpleado = resolveEmployeeId(movement, fallbackEmployeeId ?? null);
    if (!idEmpleado) {
      return;
    }

    const fecha =
      normalizeMovementDate(movement.fecha) ??
      normalizeMovementDate(movement.fecha_movimiento) ??
      normalizeMovementDate(movement.fecha_hora) ??
      normalizeMovementDate(movement.date);

    if (!fecha) {
      return;
    }

    const dedupeKey = `${idMovimiento}::${idEmpleado}::${fecha}::${tipo}`;
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    flattened.push({
      id_movimiento: idMovimiento,
      id_empleado: idEmpleado,
      fecha,
      tipo,
      raw_tipo: raw,
      original: movement,
    });
  };

  if (Array.isArray(response.empleados)) {
    for (const employee of response.empleados) {
      const employeeId = mapEmployeeRecordId(employee);
      if (!employee.movimientos || !Array.isArray(employee.movimientos)) {
        continue;
      }

      for (const movement of employee.movimientos) {
        registerMovement(movement, employeeId);
      }
    }
  }

  if (Array.isArray(response.movimientos)) {
    for (const movement of response.movimientos) {
      registerMovement(movement, undefined);
    }
  }

  if (Array.isArray(response.data)) {
    for (const entry of response.data) {
      if (isEmployeeRecord(entry)) {
        const employeeId = mapEmployeeRecordId(entry);
        for (const movement of entry.movimientos ?? []) {
          registerMovement(movement, employeeId);
        }
        continue;
      }

      if (isMovementRecord(entry)) {
        registerMovement(entry, undefined);
      }
    }
  }

  return flattened;
};

export interface VentaINVU {
  fecha: string;
  sucursal: string;
  total: number;
  propinas: number;
  itbms: number;
  num_transacciones: number;
}

export interface CompraINVU {
  proveedor: string;
  factura: string;
  fecha: string;
  subtotal: number;
  itbms: number;
  total: number;
}

/**
 * Mock: Login a INVU con credenciales de sucursal
 */
export const loginSucursal = async (usuario: string, password: string): Promise<INVULoginResponse> => {
  // Simular delay de API
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock response
  return {
    token: `mock_token_${Date.now()}`,
    expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 días
  };
};

/**
 * Mock: Obtener ventas de INVU para una sucursal
 */
export const fetchVentas = async (
  sucursalId: string, 
  desde: Date, 
  hasta: Date
): Promise<VentaINVU[]> => {
  // Simular delay de API
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Generar datos mock
  const ventas: VentaINVU[] = [];
  const dias = Math.ceil((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24));
  
  for (let i = 0; i < dias; i++) {
    const fecha = new Date(desde.getTime() + i * 24 * 60 * 60 * 1000);
    const total = Math.random() * 5000 + 1000;
    const propinas = total * 0.1;
    const itbms = total * 0.07;
    
    ventas.push({
      fecha: fecha.toISOString().split('T')[0],
      sucursal: sucursalId,
      total: Math.round(total * 100) / 100,
      propinas: Math.round(propinas * 100) / 100,
      itbms: Math.round(itbms * 100) / 100,
      num_transacciones: Math.floor(Math.random() * 50) + 10
    });
  }
  
  return ventas;
};

/**
 * Mock: Obtener compras de INVU para una sucursal
 */
export const fetchCompras = async (
  sucursalId: string, 
  desde: Date, 
  hasta: Date
): Promise<CompraINVU[]> => {
  // Simular delay de API
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Generar datos mock
  const proveedores = ['Proveedor A', 'Proveedor B', 'Proveedor C', 'Distribuidora XYZ'];
  const compras: CompraINVU[] = [];
  const numCompras = Math.floor(Math.random() * 20) + 5;
  
  for (let i = 0; i < numCompras; i++) {
    const fecha = new Date(desde.getTime() + Math.random() * (hasta.getTime() - desde.getTime()));
    const subtotal = Math.random() * 2000 + 500;
    const itbms = subtotal * 0.07;
    const total = subtotal + itbms;
    
    compras.push({
      proveedor: proveedores[Math.floor(Math.random() * proveedores.length)],
      factura: `FAC-${String(i + 1).padStart(4, '0')}`,
      fecha: fecha.toISOString().split('T')[0],
      subtotal: Math.round(subtotal * 100) / 100,
      itbms: Math.round(itbms * 100) / 100,
      total: Math.round(total * 100) / 100
    });
  }
  
  return compras.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
};

// --- INVU via Edge Function Proxy (seguro) ---
export async function fetchInvuMovementsViaProxy({
  branch,
  fini,
  ffin,
  base,
  timeout = 15000,
  path = 'invu-attendance-proxy',
}: {
  branch: "sf" | "cangrejo" | "costa" | "museo" | "central";
  fini: number;
  ffin: number;
  base?: string;
  timeout?: number;
  path?: string;
}) {
  const resolvedBase = (base ?? getFunctionsBase()).replace(/\/+$/, '') || '';
  if (!resolvedBase) throw new Error("Falta VITE_SUPABASE_FUNCTIONS_BASE en .env");
  if (!branch) throw new Error("Sucursal requerida");
  if (!Number.isFinite(fini) || !Number.isFinite(ffin) || fini > ffin) {
    throw new Error("Rango inválido (epoch segundos)");
  }

  const sanitizedPath = (path ?? 'invu-attendance-proxy').replace(/^\/+/, '');
  const url = `${resolvedBase}/${sanitizedPath}?branch=${encodeURIComponent(branch)}&fini=${Math.trunc(fini)}&ffin=${Math.trunc(ffin)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Proxy error ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ""}`);
    }
    return await res.json();
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("Tiempo de espera agotado");
    throw err;
  }
}
