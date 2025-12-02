import { useEffect, useState } from "react";
import { supabase } from "../supabase/client"; // <-- usa aquí la MISMA ruta que veas en VentasResumen

type ResumenFila = {
  fecha: string;
  nombre: string;
  total: number;
  itbms: number;
  num_transacciones: number;
};

type UseResumenVentasParams = {
  desde: string;       // "2025-11-20"
  hasta: string;       // "2025-11-27"
  sucursalId?: string | null;
};

export function useResumenVentas({ desde, hasta, sucursalId }: UseResumenVentasParams) {
  const [rows, setRows] = useState<ResumenFila[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kpis agregados para Dashboard
  const kpis = rows.reduce(
    (acc, r) => {
      acc.ventas_netas += Number(r.total ?? 0);
      acc.itbms += Number(r.itbms ?? 0);
      acc.tx += Number(r.num_transacciones ?? 0);
      return acc;
    },
    { ventas_netas: 0, itbms: 0, tx: 0 }
  );

  const ticket_promedio = kpis.tx > 0 ? kpis.ventas_netas / kpis.tx : 0;

  return { rows, loading, error, kpis: { ...kpis, ticket_promedio }, refetch: fetchData };

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        p_desde: desde,
        p_hasta: hasta,
      };

      // Sólo pasamos sucursalId si existe, para que PostgreSQL elija la firma correcta
      if (sucursalId) {
        params.p_sucursal_id = sucursalId;
      }

      const { data, error } = await supabase.rpc("api_resumen_ventas", params);

      if (error) throw error;
      setRows((data as ResumenFila[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando resumen de ventas");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
}
