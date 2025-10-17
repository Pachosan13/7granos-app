// src/lib/contabilidad.ts
import { supabase } from './supabase';

/** Normaliza fecha del UI a 'YYYY-MM-DD' */
export function toISODate(input: string | Date): string {
  if (input instanceof Date) {
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
    const [dd, mm, yyyy] = input.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }
  return input; // asumimos YYYY-MM-DD
}

/**
 * Postea journals en el rango sin Edge Function (RPC directo).
 * Soporta funciones definidas con args 'p_desde/p_hasta' o 'desde/hasta'.
 */
export async function postJournalsInRange(params: {
  desde: string | Date;
  hasta: string | Date;
  sucursalId?: string | null;
}) {
  const desdeISO = toISODate(params.desde);
  const hastaISO = toISODate(params.hasta);
  const pSucursal = params.sucursalId ?? null;

  // 1) Intento con nombres 'p_desde/p_hasta' (tu firma actual)
  let { data, error } = await supabase.rpc('cont_post_journals_in_range', {
    p_desde: desdeISO,
    p_hasta: hastaISO,
    p_sucursal_id: pSucursal,
  });

  // 2) Si el schema cache no reconoce esa firma, probamos 'desde/hasta'
  if (error && /schema cache|No function matches/i.test(error.message)) {
    const alt = await supabase.rpc('cont_post_journals_in_range', {
      desde: desdeISO,
      hasta: hastaISO,
      p_sucursal_id: pSucursal,
    });
    data = alt.data;
    error = alt.error;
  }

  if (error) {
    console.error('RPC cont_post_journals_in_range error', error);
    throw new Error(error.message);
  }
  return data;
}
