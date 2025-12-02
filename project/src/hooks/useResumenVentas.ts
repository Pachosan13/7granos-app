import { useEffect, useMemo, useState } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
)

export type ResumenRow = {
  fecha: string
  nombre: string
  total: number
  itbms: number
  num_transacciones: number
}

type Params = {
  desde: string
  hasta: string
  sucursalId?: string | null
}

export function useResumenVentas({ desde, hasta, sucursalId }: Params) {
  const [rows, setRows] = useState<ResumenRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    if (!desde || !hasta) return

    setLoading(true)
    setError(null)

    try {
      const fnName = sucursalId
        ? "api_resumen_ventas_por_sucursal"
        : "api_resumen_ventas"

      const params: Record<string, any> = {
        p_desde: desde,
        p_hasta: hasta,
      }

      if (sucursalId) {
        params.p_sucursal_id = sucursalId
      }

      const { data, error } = await supabase.rpc<ResumenRow>(fnName, params)

      if (error) throw error

      console.log("useResumenVentas DATA:", { fnName, params, data })
      setRows(data ?? [])
    } catch (e: any) {
      console.error("Error api_resumen_ventas (useResumenVentas):", e)
      setError(e?.message ?? "Error cargando resumen de ventas")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, sucursalId])

  const kpis = useMemo(() => {
    const base = rows.reduce(
      (acc, r) => {
        acc.ventas_netas += Number(r.total ?? 0)
        acc.itbms += Number(r.itbms ?? 0)
        acc.tx += Number(r.num_transacciones ?? 0)
        return acc
      },
      { ventas_netas: 0, itbms: 0, tx: 0 }
    )

    const ticket_promedio =
      base.tx > 0 ? base.ventas_netas / base.tx : 0

    return { ...base, ticket_promedio }
  }, [rows])

  return { rows, loading, error, kpis, refetch: fetchData }
}
