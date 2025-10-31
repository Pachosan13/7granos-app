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
  // 'YYYY-MM-DD' (normalizado a UTC para evitar off-by-one)
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

// Mapea alias del UI → nombres que esperan las RPC en Postgres
const mapParamNames = (p: RpcParams): RpcParams => {
  const out: RpcParams = { ...p };

  if ('mes' in out && !('p_mes' in out)) out.p_mes = out.mes;
  if ('sucursalId' in out && !('p_sucursal_id' in out)) out.p_sucursal_id = out.sucursalId;
  if ('desde' in out && !('p_desde' in out)) out.p_desde = out.desde;
  if ('hasta' in out && !('p_hasta' in out)) out.p_hasta = out.hasta;
  if ('cuenta' in out && !('p_cuenta' in out)) out.p_cuenta = out.cuenta;

  return out;
};

// Firma usada por el UI actual: rpcWithFallback('fn', payload, payloadAlt?, ...)
export async function rpcWithFallback<T>(
  fn: string,
  ...variants: RpcParams[]
): Promise<T | null> {
  const tries: RpcParams[] = [];

  // Para cada variante recibida, agregamos su versión mapeada y normalizada
  for (const v of variants.length ? variants : [{}]) {
    const mapped = mapParamNames(v || {});
    const normalized: RpcParams = {};
    for (const [k, val] of Object.entries(mapped)) {
      normalized[k] = normalizeValue(k, val);
    }
    tries.push(normalized);
  }

  // Intento “tal cual” primero (por compatibilidad con llamadas correctas ya existentes)
  if (variants.length) tries.unshift(variants[0]);

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
