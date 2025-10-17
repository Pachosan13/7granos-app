// Devuelve https://.../functions/v1 a partir de VITE_SUPABASE_URL
export function functionsBase() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('VITE_SUPABASE_URL no configurada');
  return `${url.replace(/\/$/, '')}/functions/v1`;
}
