import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface ContAccountOption {
  id: string;
  code: string;
  name: string;
  type?: string;
}

export const useContAccounts = () => {
  const [accounts, setAccounts] = useState<ContAccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('coa_account')
        .select('id,code,name,type,active')
        .eq('active', true)
        .order('code', { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      const rows = (data ?? []).map((row: any) => ({
        id: String(row.id ?? ''),
        code: row.code ? String(row.code) : '',
        name: row.name ? String(row.name) : '',
        type: row.type ? String(row.type) : undefined,
      }));

      setAccounts(rows);
    } catch (err: unknown) {
      console.warn('[contabilidad] error cargando cuentas contables', err);
      const message =
        err instanceof Error
          ? err.message
          : 'No fue posible obtener el catálogo de cuentas.';
      setAccounts([]);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return { accounts, loading, error, refetch: fetchAccounts };
};

