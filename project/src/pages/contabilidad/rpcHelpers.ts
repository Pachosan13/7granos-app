import { supabase } from '../../lib/supabase';

type RpcParams = Record<string, any>;

const toDateString = (d: any): string => {
  const x = d instanceof Date ? d : new Date(d);
  // fuerza 'YYYY-MM-DD' (PostgREST prefiere DATE plano)
  return new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()))
    .toISOString()
    .slice(0, 10);
};

const normalizeValue = (k: string, v: any) => {
  if (v === undefined) return null;
  if (v === null) return null;
  // Para los parámetros de fecha aceptados por nuestras RPC
  if (k === 'p_mes' || k === 'p_desde' || k === 'p_hasta') {
    return toDateString(v);
  }
  return v;
};

// Mapea alias usados en el UI a los nombres reales que esperan las RPC de Postgres
const mapParamNames = (p: RpcParams): RpcParams => {
  const out: RpcParams = { ...p };

  // Evitar sobrescribir si ya vienen con prefijo p_
  if ('mes' in out && !('p_mes' in out)) out.p_mes = out.mes;
  if ('sucursalId' in out && !('p_sucursal_id' in out)) out.p_sucursal_id = out.sucursalId;
  if ('desde' in out && !('p_desde' in out)) out.p_desde = out.desde;
  if ('hasta' in out && !('p_hasta' in out)) out.p_hasta = out.hasta;
  if ('cuenta' in out && !('p_cuenta' in out)) out.p_cuenta = out.cuenta;

  return out;
};

// Firma compatible con el UI actual: rpcWithFallback('fn', payload, payloadAlternativo?, ...)
export async function rpcWithFallback<T>(
  fn: string,
  ...variants: RpcParams[]
): Promise<T | null> {
  const tries: RpcParams[] = [];

  // Prepara intentos: para cada variante recibida, agrega su versión mapeada y normalizada
  for (const v of variants.length ? variants : [{}]) {
    const mapped = mapParamNames(v || {});
    const normalized: RpcParams = {};
    for (const [k, val] of Object.entries(mapped)) {
      normalized[k] = normalizeValue(k, val);
    }
    tries.push(normalized);
  }

  // Siempre intentamos también la primera variante “tal cual” por si ya viene correcta
  if (variants.length) tries.unshift(variants[0]);

  let lastErr: any = null;

  for (const payload of tries) {
    try {
      const { data, error } = await supabase.rpc(fn, payload);
      if (!error) return (data as unknown) as T;
      lastErr = error;
      // Log útil para depurar en preview
      // eslint-disable-next-line no-console
      console.warn(`[rpcWithFallback] ${fn} falló con payload`, payload, error?.message);
    } catch (e) {
      lastErr = e;
      // eslint-disable-next-line no-console
      console.warn(`[rpcWithFallback] ${fn} excepción con payload`, payload, e);
    }
  }

  // eslint-disable-next-line no-console
  console.error(`[rpcWithFallback] ${fn} agotó variantes`, lastErr);
  return null;
}
