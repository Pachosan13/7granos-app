import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
);

export interface ResumenVentas {
  ventasNetas: number;
  cogs: number;
  gastos: number;
  numTransacciones: number;
  itbms: number;
}

export interface ResumenVentasRow {
  fecha?: string | null;
  nombre?: string | null;
  total?: number | null;
  itbms?: number | null;
  num_transacciones?: number | null;
  sucursal_id?: string | null;
  cogs?: number | null;
  gastos?: number | null;
}

interface UseResumenVentasParams {
  desde: string;
  hasta: string;
  sucursalId?: string | null;
}

interface ResumenVentasResult {
  rows: ResumenVentasRow[];
  resumen: ResumenVentas;
}

const emptyResumen: ResumenVentas = {
  ventasNetas: 0,
  cogs: 0,
  gastos: 0,
  numTransacciones: 0,
  itbms: 0,
};

const emptyState: ResumenVentasResult = { rows: [], resumen: emptyResumen };

export function useResumenVentas({ desde, hasta, sucursalId }: UseResumenVentasParams) {
  const [data, setData] = useState<ResumenVentasResult>(emptyState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      const { data: rpcData, error: rpcError } = await supabase.rpc('api_resumen_ventas', {
        p_desde: desde,
        p_hasta: hasta,
      });

      if (!isMounted) return;

      if (rpcError) {
        setError(rpcError.message);
        setData(emptyState);
        setLoading(false);
        return;
      }

      const rows = (rpcData ?? []) as ResumenVentasRow[];
      const filteredRows = sucursalId ? rows.filter((row) => row.sucursal_id === sucursalId) : rows;

      const resumen = filteredRows.reduce<ResumenVentas>((acc, row) => {
        const ventas = Number(row.total ?? 0);
        const cogs = Number(row.cogs ?? 0);
        const gastos = Number(row.gastos ?? 0);
        const itbms = Number(row.itbms ?? 0);
        const tx = Number(row.num_transacciones ?? 0);
        return {
          ventasNetas: acc.ventasNetas + ventas,
          cogs: acc.cogs + cogs,
          gastos: acc.gastos + gastos,
          numTransacciones: acc.numTransacciones + tx,
          itbms: acc.itbms + itbms,
        };
      }, emptyResumen);

      setData({ rows: filteredRows, resumen });
      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [desde, hasta, sucursalId]);

  const memoizedData = useMemo(() => data, [data]);

  return { data: memoizedData, loading, error };
}
