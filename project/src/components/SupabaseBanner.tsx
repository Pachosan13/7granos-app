import { AlertTriangle } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';

export const SupabaseBanner = () => {
  if (isSupabaseConfigured) return null;

  return (
    <div className="bg-red-50 border-l-4 border-red-400 p-4 fixed top-0 left-0 right-0 z-50">
      <div className="flex">
        <div className="flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
        <div className="ml-3">
          <p className="text-sm text-red-700">
            <strong>Configuración faltante:</strong> Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en las variables de entorno.
          </p>
        </div>
      </div>
    </div>
  );
};