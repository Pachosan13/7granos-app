import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const DEMO = import.meta.env.VITE_DEMO === '1';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
export const shouldUseDemoMode = DEMO || !isSupabaseConfigured;

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase no está configurado. Por favor verifica las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY'
  );
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
