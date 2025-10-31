import { supabase } from '../../lib/supabase';

export type RpcParams = Record<string, any>;

export const toNumber = (v: any): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isNaN(v) ? 0 : v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const formatDateIso = (d: any): string => {
  const x = d instanceof Date ? d : new Date(d);
  // Normaliza a 'YYYY-MM-DD' en UTC para evitar off-by-one
  return new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()))
    .toISOString()
    .slice(0, 10);
};

const normalizeValue = (k: string, v: any) => {
  if (v === undefined || v === null) return null;
  if (k === 'p_mes' || k === 'p_desde' || k === 'p_hasta') {
    return formatDateIso(v);
  }
  return v;
};

// Mapea alias del UI → nombres que esperan las RPC
const mapParamNames = (p: RpcParams): RpcParams => {
  const out: RpcParams = { ...p };
  if ('mes' in out && !('p_mes' in out)) out.p_mes = out.mes;
  if ('sucursalId' in out && !('p_sucursal_id' in out)) out.p_sucursal_id = out.sucursalId;
  if ('desde' in out && !('p_desde' in out)) out.p_desde = out.desde;
  if ('hasta' in out && !('p_hasta' in out)) out.p_hasta = out.hasta;
  if ('cuenta' in out && !('p_cuenta' in out)) out.p_cuenta = out.cuenta;
  return out;
};

// Lista blanca de parámetros que acepta cada función RPC
const ALLOW: Record<string, string[]> = {
  api_get_pyg: ['p_mes', 'p_sucursal_id'],
  api_get_balance: ['p_mes', 'p_sucursal_id'],
  api_get_mayor: ['p_desde', 'p_hasta', 'p_sucursal_id', 'p_cuenta'],
};

// Deja SOLO los parámetros permitidos para la función
const cleanForFn = (fn: string, payload: RpcParams): RpcParams => {
  const allowed = ALLOW[fn];
  if (!allowed) return payload; // por si se usa con otra RPC
  const cleaned: RpcParams = {};
  for (const k of allowed) {
    if (k in payload) cleaned[k] = payload[k];
  }
  return cleaned;
};

// Firma usada por el UI: rpcWithFallback('fn', payload, payloadAlt?, ...)
export async function rpcWithFallback<T>(
  fn: string,
  ...variants: RpcParams[]
): Promise<T | null> {
  const tries: RpcParams[] = [];

  // Para cada variante recibida, mapea → normaliza → filtra por función
  for (const v of variants.length ? variants : [{}]) {
    const mapped = mapParamNames(v || {});
    const normalized: RpcParams = {};
    for (const [k, val] of Object.entries(mapped)) {
      normalized[k] = normalizeValue(k, val);
    }
    const cleaned = cleanForFn(fn, normalized);
    tries.push(cleaned);
  }

  // No hacemos intento “tal cual” para evitar enviar claves extra no permitidas

  let lastErr: any = null;

  for (const payload of tries) {
    try {
      const { data, error } = await supabase.rpc(fn, payload);
      if (!error) return (data as unknown) as T;
      lastErr = error;
      // eslint-disable-next-line no-console
      console.warn(`[rpcWithFallback] ${fn} falló`, payload, error?.message);
    } catch (e) {
      lastErr = e;
      // eslint-disable-next-line no-console
      console.warn(`[rpcWithFallback] ${fn} excepción`, payload, e);
    }
  }

  // eslint-disable-next-line no-console
  console.error(`[rpcWithFallback] ${fn} agotó variantes`, lastErr);
  return null;
}
