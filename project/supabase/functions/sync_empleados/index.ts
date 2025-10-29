// supabase/functions/sync_empleados/index.ts
// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL) {
  console.error('[sync_empleados] Falta SUPABASE_URL en variables de entorno');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[sync_empleados] Falta SUPABASE_SERVICE_ROLE_KEY en variables de entorno');
}

type SucursalConfig = {
  id: string;
  nombre?: string;
  token?: string;
  usuario?: string;
  password?: string;
};

const INVU_SUCURSALES_RAW = Deno.env.get('INVU_SUCURSALES') ?? '[]';
let INVU_SUCURSALES: SucursalConfig[]; // los creds pueden ser token o user/pass
try {
  const parsed = JSON.parse(INVU_SUCURSALES_RAW);
  INVU_SUCURSALES = Array.isArray(parsed) ? parsed : [];
} catch (err) {
  console.error('[sync_empleados] INVU_SUCURSALES inválido', err);
  INVU_SUCURSALES = [];
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

type InvuEmpleado = {
  id?: string | number;
  empleado_id?: string | number;
  nombre?: string;
  apellido?: string;
  primerNombre?: string;
  segundoNombre?: string;
  primerApellido?: string;
  segundoApellido?: string;
  email?: string;
  correo?: string;
  telefono?: string;
  celular?: string;
  rol?: string;
  cargo?: string;
  activo?: boolean | string;
};

type SyncResult = {
  sucursal_id: string;
  count?: number;
  error?: string;
};

async function fetchInvuEmployees(token: string): Promise<InvuEmpleado[]> {
  const url = 'https://api6.invupos.com/invuApiPos/index.php?r=empleados/list';
  const res = await fetch(url, {
    headers: { authorization: token },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`INVU ${res.status} ${errorBody}`.trim());
  }

  const payload = (await res.json().catch(() => null)) as unknown;
  if (isRecord(payload) && Array.isArray(payload.data)) {
    return payload.data.filter((item): item is InvuEmpleado => isInvuEmpleado(item));
  }
  if (Array.isArray(payload)) {
    return payload.filter((item): item is InvuEmpleado => isInvuEmpleado(item));
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInvuEmpleado(value: unknown): value is InvuEmpleado {
  return isRecord(value);
}

function normalizeNombre(e: InvuEmpleado): string {
  const parts = [
    e.nombre,
    e.primerNombre,
    e.segundoNombre,
    e.apellido,
    e.primerApellido,
    e.segundoApellido,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);

  if (parts.length > 0) {
    return parts.join(' ');
  }

  const fallbackId = e.id ?? e.empleado_id;
  if (fallbackId !== undefined && fallbackId !== null) {
    return String(fallbackId);
  }

  return 'Empleado';
}

function normalizeId(e: InvuEmpleado): string {
  const raw = e.id ?? e.empleado_id;
  return raw === undefined || raw === null ? crypto.randomUUID() : String(raw);
}

function normalizeTelefono(e: InvuEmpleado): string | null {
  const telefono = e.telefono ?? e.celular;
  return telefono ? String(telefono) : null;
}

function normalizeEmail(e: InvuEmpleado): string | null {
  const correo = e.email ?? e.correo;
  return correo ? String(correo) : null;
}

function normalizeRol(e: InvuEmpleado): string | null {
  const rol = e.rol ?? e.cargo;
  return rol ? String(rol) : null;
}

function isSucursalConfigValid(sucursal: SucursalConfig): sucursal is SucursalConfig & { token: string } {
  return typeof sucursal.id === 'string' && typeof sucursal.token === 'string' && sucursal.token.length > 0;
}

function parseActivo(e: InvuEmpleado): boolean {
  const raw = e.activo;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'activo', 'activa', 'active', 'si', 'sí'].includes(normalized)) return true;
    if (['0', 'false', 'inactivo', 'inactive', 'no'].includes(normalized)) return false;
  }
  return true;
}

async function upsertEmpleados(
  sucursalId: string,
  empleados: InvuEmpleado[],
): Promise<number> {
  if (!supabase) throw new Error('Supabase no configurado en edge function');

  if (empleados.length === 0) {
    return 0;
  }

  const payload = empleados.map((empleado) => ({
    invu_employee_id: normalizeId(empleado),
    sucursal_id: sucursalId,
    nombre: normalizeNombre(empleado),
    email: normalizeEmail(empleado),
    telefono: normalizeTelefono(empleado),
    rol: normalizeRol(empleado),
    activo: parseActivo(empleado),
  }));

  const { error } = await supabase
    .from('hr_empleado')
    .upsert(payload, { onConflict: 'sucursal_id,invu_employee_id' });

  if (error) {
    throw new Error(error.message ?? String(error));
  }

  return payload.length;
}

async function syncSucursal(sucursal: SucursalConfig): Promise<SyncResult> {
  const sucursalId = String(sucursal.id);
  if (!isSucursalConfigValid(sucursal)) {
    return { sucursal_id: sucursalId, error: 'Sucursal sin token configurado' };
  }

  try {
    const empleados = await fetchInvuEmployees(sucursal.token);
    const count = await upsertEmpleados(sucursalId, empleados);
    return { sucursal_id: sucursalId, count };
  } catch (err) {
    console.error('[sync_empleados] Error sucursal', sucursalId, err);
    return { sucursal_id: sucursalId, error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), {
        status: 405,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (!supabase) {
      return new Response(JSON.stringify({ ok: false, error: 'Supabase no configurado' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const targetSucursalId = body?.sucursal_id ?? url.searchParams.get('sucursal_id') ?? null;

    const sucursales = INVU_SUCURSALES.filter((sucursal) => {
      if (!targetSucursalId) return true;
      return String(sucursal.id) === String(targetSucursalId);
    });

    if (sucursales.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'No hay sucursales configuradas para sincronizar' }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    const results: SyncResult[] = [];
    for (const sucursal of sucursales) {
      const result = await syncSucursal(sucursal);
      results.push(result);
    }

    const ok = results.every((item) => !item.error);
    const status = ok ? 200 : 207; // Multi-Status style when some fail

    return new Response(JSON.stringify({ ok, results }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('[sync_empleados] Error inesperado', error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
