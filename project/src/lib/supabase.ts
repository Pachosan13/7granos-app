// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

/**
 * Variables de entorno (Vite)
 * - En GitHub Actions las tomamos desde los "Secrets" que ya creaste.
 * - En local, puedes tenerlas en .env.local
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Bandera de demo (opcional):
 *  - VITE_DEMO=1 → fuerza modo demo.
 *  - Si faltan credenciales, también entra en demo automáticamente.
 */
export const DEMO = import.meta.env.VITE_DEMO === '1';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const shouldUseDemoMode = DEMO || !isSupabaseConfigured;

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] No hay credenciales. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (o usa VITE_DEMO=1).'
  );
}

/**
 * Cliente Supabase
 * - Si no hay credenciales, crea un cliente "placeholder" que nunca debería usarse en producción;
 *   tu UI debe activar fallback demo cuando shouldUseDemoMode === true.
 */
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
