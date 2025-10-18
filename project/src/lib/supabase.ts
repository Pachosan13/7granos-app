import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase no está configurado. Por favor verifica las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

type PingResult = { ok: boolean; status: number; note: string };

export async function pingSupabase(): Promise<PingResult> {
  try {
    if (!isSupabaseConfigured) {
      return { ok: false, status: 0, note: 'Supabase no está configurado en el cliente' };
    }
    const { error, status, count } = await supabase
      .from('invu_ventas')
      .select('fecha', { count: 'exact', head: true })
      .limit(1);

    if (error) {
      return {
        ok: false,
        status: status ?? 0,
        note: error.message || 'Error desconocido al consultar invu_ventas',
      };
    }

    return {
      ok: true,
      status: status ?? 200,
      note: typeof count === 'number' ? `count=${count}` : 'Consulta exitosa',
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      note: err instanceof Error ? err.message : 'Error inesperado en pingSupabase',
    };
  }
}
