import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type NullableNumber = number | string | null | undefined;
export type RpcParamValue = string | number | boolean | null | undefined;
export type RpcParams = Record<string, RpcParamValue>;

export function toNumber(value: NullableNumber): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeParams(params: RpcParams): Record<string, RpcParamValue> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as Record<string, RpcParamValue>;
}

export async function rpcWithFallback<T>(
  fn: string,
  variants: RpcParams[]
): Promise<T | null> {
  let lastError: PostgrestError | Error | null = null;
  for (let index = 0; index < variants.length; index += 1) {
    const params = normalizeParams(variants[index]);
    const response = await supabase.rpc<T>(fn, params as Record<string, unknown>);
    if (!response.error) {
      if (index > 0) {
        console.warn(
          `[contabilidad] ${fn} ejecutado con firma alternativa #${index + 1}`,
          params
        );
      }
      return response.data ?? null;
    }
    lastError = response.error;
  }
  throw lastError ?? new Error(`No se pudo ejecutar ${fn}`);
}

export function formatDateIso(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString('es-PA', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}
