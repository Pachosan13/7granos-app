// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

/**
 * Leemos variables tipo Vite (import.meta.env.*).
 * En CI (GitHub Actions), las inyectaremos como ENV (ver workflow más abajo).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Flag opcional para forzar modo demo localmente:
 * VITE_DEMO=1 → fuerza fallback sin tocar backend
 */
export const DEMO = import.meta.env.VITE_DEMO === '1';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
export const shouldUseDemoMode = DEMO || !isSupabaseConfigured;

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] ⚠️ Variables faltantes. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.\n' +
    'Se creará un cliente placeholder y la app debería entrar en modo demo si lo manejas en UI.'
  );
}

/**
 * Cliente Supabase.
 * Si faltan envs, se crea con placeholders para que el import no rompa
 * (tu UI debe decidir usar fallback cuando shouldUseDemoMode === true).
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'anon-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers:
