import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Status = 'open' | 'closed' | 'error';

export function useRealtimeVentas(onUpdate?: () => void) {
  const [status, setStatus] = useState<Status>('closed');

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL) {
      console.warn('Realtime disabled — no Supabase URL configured');
      return;
    }

    const channel = supabase
      .channel('realtime:ventas')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ventas' },
        (payload) => {
          console.log('🔄 Cambio detectado en ventas:', payload);
          onUpdate?.();
        }
      )
      .subscribe((s) => setStatus(s as Status));

    return () => channel.unsubscribe();
  }, [onUpdate]);

  return status;
}
